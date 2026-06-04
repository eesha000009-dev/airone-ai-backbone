/********************************************************************************
 * Copyright (C) 2025 Airone and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { injectable, inject } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { CommandService } from '@theia/core/lib/common/command';
import { MessageService } from '@theia/core/lib/common/message-service';
import { ApplicationShell } from '@theia/core/lib/browser/shell';

/**
 * Toolbar contribution that creates a SEPARATE toolbar row below the menu bar
 * for Compile, Upload, and Serial Monitor buttons.
 *
 * CRITICAL: All DOM manipulation is wrapped in try-catch to prevent
 * the entire application from crashing if any operation fails.
 */
@injectable()
export class AiroToolbarContribution implements FrontendApplicationContribution {

    @inject(CommandService)
    protected readonly commandService!: CommandService;

    @inject(MessageService)
    protected readonly messageService!: MessageService;

    @inject(ApplicationShell)
    protected readonly shell!: ApplicationShell;

    private observer: MutationObserver | null = null;
    private injected = false;
    private retryCount = 0;
    private readonly MAX_RETRIES = 100;
    private retryTimer: ReturnType<typeof setTimeout> | null = null;
    private updateReadyBtn: HTMLButtonElement | null = null;
    private layoutResizeObserver: ResizeObserver | null = null;
    private layoutMutationObserver: MutationObserver | null = null;
    private debounceTimer: ReturnType<typeof setTimeout> | null = null;
    private isAdjusting = false;

    onStart(): void {
        try {
            this.scheduleInject();
        } catch (e) {
            console.error('[AiroToolbar] Error in onStart:', e);
        }
    }

    protected scheduleInject(): void {
        try {
            this.tryInject();

            if (this.injected) {
                return;
            }

            this.observer = new MutationObserver(() => {
                // Debounce: don't try on every mutation
                if (this.debounceTimer || this.injected) {
                    return;
                }
                this.debounceTimer = setTimeout(() => {
                    this.debounceTimer = null;
                    if (!this.injected) {
                        this.tryInject();
                    }
                }, 150);
            });

            const startObserving = () => {
                try {
                    if (document.body) {
                        this.observer!.observe(document.body, { childList: true, subtree: true });
                    } else {
                        setTimeout(startObserving, 200);
                    }
                } catch (e) {
                    console.error('[AiroToolbar] Failed to start observer:', e);
                }
            };
            startObserving();

            this.retryTimer = setInterval(() => {
                try {
                    if (this.injected || this.retryCount >= this.MAX_RETRIES) {
                        if (this.retryTimer) {
                            clearInterval(this.retryTimer);
                            this.retryTimer = null;
                        }
                        return;
                    }
                    this.tryInject();
                } catch (e) {
                    console.error('[AiroToolbar] Error in retry:', e);
                }
            }, 500);
        } catch (e) {
            console.error('[AiroToolbar] Error in scheduleInject:', e);
        }
    }

    protected findTopPanel(): HTMLElement | null {
        const selectors = [
            '#theia-top-panel',
            '.theia-top-panel',
            '[class*="theia-top-panel"]',
            '#theia-menubar',
            '.lm-MenuBar',
            '.p-MenuBar',
            '.theia-MenuBar',
        ];
        for (const sel of selectors) {
            try {
                const el = document.querySelector<HTMLElement>(sel);
                if (el) {
                    return el;
                }
            } catch { /* invalid selector */ }
        }
        return null;
    }

    protected tryInject(): void {
        try {
            if (this.retryCount >= this.MAX_RETRIES) {
                return;
            }
            this.retryCount++;

            if (document.getElementById('airo-secondary-toolbar')) {
                this.injected = true;
                this.cleanup();
                return;
            }

            const topPanel = this.findTopPanel();
            if (topPanel) {
                this.insertToolbarInsideTopPanel(topPanel);
                return;
            }

            // Fallback: If we can't find the top panel, try inserting before main content
            const mainPanel = document.getElementById('theia-main-content-panel') ||
                document.querySelector('.theia-main-content-panel') ||
                document.querySelector('[class*="main-content-panel"]');

            if (mainPanel && mainPanel.parentElement) {
                this.insertToolbarBefore(mainPanel);
                return;
            }
        } catch (e) {
            console.error('[AiroToolbar] Error in tryInject:', e);
        }
    }

    protected insertToolbarInsideTopPanel(topPanel: HTMLElement): void {
        try {
            const toolbarRow = this.createToolbarRow();

            // Make the top panel a flex column so menu bar and toolbar stack vertically
            topPanel.style.display = 'flex';
            topPanel.style.flexDirection = 'column';

            // Append toolbar as last child of top panel (below the menu bar)
            topPanel.appendChild(toolbarRow);

            this.injected = true;
            this.removeNavigationArrows();
            this.cleanup();

            // Adjust the layout so the editor area doesn't overlap with the toolbar
            this.adjustLayoutAfterToolbarInsert();
        } catch (e) {
            console.error('[AiroToolbar] Error inserting toolbar:', e);
        }
    }

    protected insertToolbarBefore(beforeElement: HTMLElement): void {
        try {
            const toolbarRow = this.createToolbarRow();
            if (beforeElement.parentNode) {
                beforeElement.parentNode.insertBefore(toolbarRow, beforeElement);
            }
            this.injected = true;
            this.removeNavigationArrows();
            this.cleanup();
            this.adjustLayoutAfterToolbarInsert();
        } catch (e) {
            console.error('[AiroToolbar] Error inserting toolbar (fallback):', e);
        }
    }

    // ─── SVG Icons ────────────────────────────────────────────────────────────

    protected get compileIconSvg(): string {
        return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
    }

    protected get uploadIconSvg(): string {
        return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`;
    }

    protected get serialIconSvg(): string {
        return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`;
    }

    protected get restartIconSvg(): string {
        return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>`;
    }

    // ─── Toolbar Creation ─────────────────────────────────────────────────────

    protected createToolbarRow(): HTMLElement {
        const toolbarRow = document.createElement('div');
        toolbarRow.id = 'airo-secondary-toolbar';
        toolbarRow.className = 'airo-secondary-toolbar';

        // Left group: Compile, Upload
        const leftGroup = document.createElement('div');
        leftGroup.className = 'airo-toolbar-left';

        leftGroup.appendChild(this.createButton(
            'airo-compile-btn',
            this.compileIconSvg,
            'Compile',
            '#27ae60',
            '#219a52',
            () => this.executeCommand('airo.compile')
        ));

        leftGroup.appendChild(this.createButton(
            'airo-upload-btn',
            this.uploadIconSvg,
            'Upload',
            '#e67e22',
            '#d35400',
            () => this.executeCommand('airo.upload')
        ));

        // Right group: Serial Monitor, Restart to Update (hidden until update is ready)
        const rightGroup = document.createElement('div');
        rightGroup.className = 'airo-toolbar-right';

        rightGroup.appendChild(this.createButton(
            'airo-serial-btn',
            this.serialIconSvg,
            'Serial Monitor',
            '#555555',
            '#444444',
            () => this.executeCommand('airo.serialMonitor')
        ));

        // Restart to Update button — hidden by default, shown when update is downloaded
        this.updateReadyBtn = this.createButton(
            'airo-restart-update-btn',
            this.restartIconSvg,
            'Restart to Update',
            '#c0392b',
            '#a93226',
            () => this.executeCommand('airo.restartUpdate')
        );
        this.updateReadyBtn.style.display = 'none';
        rightGroup.appendChild(this.updateReadyBtn);

        toolbarRow.appendChild(leftGroup);
        toolbarRow.appendChild(rightGroup);

        // Watch for update readiness via DOM signals
        this.watchForUpdateSignal();

        return toolbarRow;
    }

    protected watchForUpdateSignal(): void {
        try {
            // Check for the updater's signal element periodically
            const checkInterval = setInterval(() => {
                try {
                    if (!this.updateReadyBtn) {
                        clearInterval(checkInterval);
                        return;
                    }

                    // Method 1: Check for data attribute on body set by the updater
                    if (document.body.hasAttribute('data-airone-update-ready')) {
                        this.showUpdateReadyButton();
                        clearInterval(checkInterval);
                        return;
                    }
                } catch (e) {
                    clearInterval(checkInterval);
                }
            }, 10000); // Check every 10 seconds (non-invasive)

            // Also observe DOM mutations for the signal element
            try {
                const signalObserver = new MutationObserver(mutations => {
                    try {
                        for (const mutation of mutations) {
                            if (mutation.type === 'attributes' && mutation.attributeName === 'data-airone-update-ready') {
                                if (document.body.hasAttribute('data-airone-update-ready')) {
                                    this.showUpdateReadyButton();
                                    signalObserver.disconnect();
                                    return;
                                }
                            }
                        }
                    } catch (e) {
                        console.error('[AiroToolbar] Error in update signal observer:', e);
                    }
                });

                signalObserver.observe(document.body, { attributes: true, attributeFilter: ['data-airone-update-ready'] });
            } catch (e) {
                console.error('[AiroToolbar] Failed to set up update signal observer:', e);
            }
        } catch (e) {
            console.error('[AiroToolbar] Error in watchForUpdateSignal:', e);
        }
    }

    showUpdateReadyButton(): void {
        try {
            if (this.updateReadyBtn) {
                this.updateReadyBtn.style.display = 'inline-flex';
            }
        } catch (e) {
            console.error('[AiroToolbar] Error showing update button:', e);
        }
    }

    protected createButton(
        id: string,
        iconSvg: string,
        label: string,
        bg: string,
        hoverBg: string,
        onClick: () => void
    ): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.id = id;
        btn.title = label;
        btn.className = 'airo-toolbar-btn';

        const iconSpan = document.createElement('span');
        iconSpan.className = 'airo-toolbar-icon';
        iconSpan.innerHTML = iconSvg;
        iconSpan.style.cssText = `
            display: inline-flex;
            align-items: center;
            margin-right: 5px;
            line-height: 1;
        `;

        const labelSpan = document.createElement('span');
        labelSpan.className = 'airo-toolbar-label';
        labelSpan.textContent = label;

        btn.appendChild(iconSpan);
        btn.appendChild(labelSpan);

        btn.style.cssText = `
            background: ${bg};
            color: white;
            border: 1px solid ${hoverBg};
            border-radius: 4px;
            padding: 4px 12px;
            cursor: pointer;
            font-weight: 700;
            font-size: 13px;
            white-space: nowrap;
            line-height: 24px;
            margin-left: 4px;
            margin-right: 2px;
            transition: filter 0.15s ease, transform 0.1s ease;
            letter-spacing: 0.3px;
            text-shadow: 0 1px 1px rgba(0,0,0,0.2);
            box-shadow: 0 1px 3px rgba(0,0,0,0.15);
            display: inline-flex;
            align-items: center;
        `;

        btn.addEventListener('mouseenter', () => {
            btn.style.filter = 'brightness(1.2)';
            btn.style.transform = 'translateY(-1px)';
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.filter = 'none';
            btn.style.transform = 'none';
        });
        btn.addEventListener('click', () => {
            try {
                onClick();
            } catch (e) {
                console.error('[AiroToolbar] Button click error:', e);
            }
        });
        return btn;
    }

    // ─── Remove Navigation Arrows ─────────────────────────────────────────────

    protected removeNavigationArrows(): void {
        try {
            document.querySelectorAll<HTMLElement>('[data-command*="navigation.back"], [data-command*="navigation.forward"]').forEach(el => {
                try { this.hideElement(el); } catch { /* skip */ }
            });

            document.querySelectorAll<HTMLElement>('[id*="navigation.back"], [id*="navigation.forward"], [id*="navigate.back"], [id*="navigate.forward"]').forEach(el => {
                try { this.hideElement(el); } catch { /* skip */ }
            });
        } catch (e) {
            console.error('[AiroToolbar] Error removing nav arrows:', e);
        }
    }

    protected hideElement(el: HTMLElement): void {
        el.style.display = 'none';
        el.style.width = '0';
        el.style.height = '0';
        el.style.overflow = 'hidden';
        el.style.padding = '0';
        el.style.margin = '0';
        el.style.border = 'none';
        el.style.minWidth = '0';
        el.style.position = 'absolute';
        el.style.visibility = 'hidden';
        el.style.pointerEvents = 'none';
    }

    protected async executeCommand(commandId: string): Promise<void> {
        try {
            await this.commandService.executeCommand(commandId);
        } catch (err: any) {
            this.messageService.error(`Command error: ${err.message}`);
        }
    }

    /**
     * Adjust the layout after the toolbar is inserted.
     * Throttled to prevent excessive recalculation.
     */
    protected adjustLayoutAfterToolbarInsert(): void {
        const adjustOnce = () => {
            if (this.isAdjusting) return;
            this.isAdjusting = true;

            try {
                const topPanel = this.findTopPanel();
                if (!topPanel) return;

                const actualHeight = topPanel.offsetHeight;

                const mainContentPanel = document.getElementById('theia-main-content-panel') ||
                    document.querySelector('.theia-main-content-panel') as HTMLElement;

                if (mainContentPanel) {
                    mainContentPanel.style.top = `${actualHeight}px`;
                }

                // Trigger Theia's layout engine to recalculate
                try {
                    window.dispatchEvent(new Event('resize'));
                } catch { /* ignore */ }
            } catch (e) {
                console.error('[AiroToolbar] Error adjusting layout:', e);
            } finally {
                this.isAdjusting = false;
            }
        };

        // Adjust at staggered intervals
        try {
            adjustOnce();
            setTimeout(adjustOnce, 100);
            setTimeout(adjustOnce, 500);
            setTimeout(adjustOnce, 1500);
            setTimeout(adjustOnce, 3000);
        } catch (e) {
            console.error('[AiroToolbar] Error in layout adjustment scheduling:', e);
        }

        // Set up ResizeObserver on the top panel to continuously adjust
        try {
            const topPanel = this.findTopPanel();
            if (topPanel) {
                this.layoutResizeObserver = new ResizeObserver(() => {
                    try { adjustOnce(); } catch { /* ignore */ }
                });
                this.layoutResizeObserver.observe(topPanel);
            }
        } catch (e) {
            console.error('[AiroToolbar] Failed to set up ResizeObserver:', e);
        }

        // Observe when Theia's layout engine resets the main content panel's position
        try {
            const mainContentPanel = document.getElementById('theia-main-content-panel') ||
                document.querySelector('.theia-main-content-panel');
            if (mainContentPanel) {
                this.layoutMutationObserver = new MutationObserver(() => {
                    try { adjustOnce(); } catch { /* ignore */ }
                });
                this.layoutMutationObserver.observe(mainContentPanel, {
                    attributes: true,
                    attributeFilter: ['style']
                });
            }
        } catch (e) {
            console.error('[AiroToolbar] Failed to set up layout MutationObserver:', e);
        }
    }

    protected cleanup(): void {
        try {
            if (this.debounceTimer) {
                clearTimeout(this.debounceTimer);
                this.debounceTimer = null;
            }
            if (this.observer) {
                this.observer.disconnect();
                this.observer = null;
            }
            if (this.retryTimer) {
                clearInterval(this.retryTimer);
                this.retryTimer = null;
            }
        } catch (e) {
            console.error('[AiroToolbar] Error in cleanup:', e);
        }
    }

    dispose(): void {
        try {
            this.cleanup();
            if (this.layoutResizeObserver) {
                this.layoutResizeObserver.disconnect();
                this.layoutResizeObserver = null;
            }
            if (this.layoutMutationObserver) {
                this.layoutMutationObserver.disconnect();
                this.layoutMutationObserver = null;
            }
        } catch (e) {
            console.error('[AiroToolbar] Error in dispose:', e);
        }
    }
}
