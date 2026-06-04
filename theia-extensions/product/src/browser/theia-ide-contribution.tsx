/********************************************************************************
 * Copyright (C) 2025 Airone and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { inject, injectable } from '@theia/core/shared/inversify';
import { Command, CommandContribution, CommandRegistry } from '@theia/core/lib/common/command';
import { MenuContribution, MenuModelRegistry, MenuPath } from '@theia/core/lib/common/menu';
import { WindowService } from '@theia/core/lib/browser/window/window-service';

export namespace TheiaIDEMenus {
    export const THEIA_IDE_HELP: MenuPath = ['tools_menu', 'airone-ide'];
}

export namespace TheiaIDECommands {
    export const CATEGORY = 'AironeIDE';
    export const REPORT_ISSUE: Command = {
        id: 'airone-ide:report-issue',
        category: CATEGORY,
        label: 'Report Issue'
    };
    export const DOCUMENTATION: Command = {
        id: 'airone-ide:documentation',
        category: CATEGORY,
        label: 'Documentation'
    };

    // Rename Extensions → Libraries
    export const OPEN_LIBRARIES: Command = {
        id: 'airone-ide:open-libraries',
        category: CATEGORY,
        label: 'Libraries'
    };
}

/**
 * Contribution that renames the VS Code Extensions view label to "Libraries",
 * adds Airone-specific menu entries, and hides unwanted menus/sidebar items.
 *
 * Uses WHITELIST approach for menus: ALL menus are hidden via CSS, then only
 * the allowed ones (File, Edit, View, Libraries, Tools) are shown by adding
 * a data-airone-visible="true" attribute that CSS matches.
 *
 * CRITICAL: All DOM manipulation is wrapped in try-catch to prevent
 * the entire application from crashing if any operation fails.
 * Observers are debounced to prevent infinite loops.
 */
@injectable()
export class TheiaIDEContribution implements CommandContribution, MenuContribution {

    @inject(WindowService)
    protected readonly windowService: WindowService;

    static REPORT_ISSUE_URL = 'https://github.com/eesha000009-dev/airone-ide/issues/new';
    static DOCUMENTATION_URL = 'https://github.com/eesha000009-dev/airone-ide#readme';

    /** Only these menu labels should be visible in the menu bar */
    static readonly ALLOWED_MENU_LABELS = new Set(['File', 'Edit', 'View', 'Libraries', 'Tools']);

    private uiObserver: MutationObserver | undefined = undefined;
    private hideAttempts = 0;
    private readonly MAX_HIDE_ATTEMPTS = 300;
    private debounceTimer: ReturnType<typeof setTimeout> | undefined = undefined;
    private isModifying = false;

    constructor() {
        // Delay starting the observer until the app is fully loaded
        // This prevents crashes during Theia's early initialization
        try {
            if (typeof window !== 'undefined') {
                window.addEventListener('load', () => {
                    // Wait an additional 2 seconds after load for Theia to fully initialize
                    setTimeout(() => this.startUIObserver(), 2000);
                });
                // Fallback: start after 5 seconds regardless
                setTimeout(() => {
                    if (!this.uiObserver) {
                        this.startUIObserver();
                    }
                }, 5000);
            }
        } catch (e) {
            console.error('[AironeIDE] Failed to initialize UI observer:', e);
        }
    }

    /**
     * Unified observer that handles all DOM-based UI modifications.
     * DEBOUNCED: mutations are batched and processed at most once per 200ms
     * to prevent infinite loops and performance issues.
     */
    protected startUIObserver(): void {
        try {
            this.modifyUI();

            this.uiObserver = new MutationObserver(() => {
                // Debounce: only process mutations every 200ms
                if (this.debounceTimer) {
                    return; // Already scheduled
                }
                this.debounceTimer = setTimeout(() => {
                    this.debounceTimer = undefined;
                    this.modifyUI();
                }, 200);
            });

            const startObserving = () => {
                try {
                    if (document.body) {
                        this.uiObserver!.observe(document.body, {
                            childList: true,
                            subtree: true,
                            characterData: true
                        });
                    } else {
                        setTimeout(startObserving, 500);
                    }
                } catch (e) {
                    console.error('[AironeIDE] Failed to start observing:', e);
                }
            };
            startObserving();
        } catch (e) {
            console.error('[AironeIDE] Failed to start UI observer:', e);
        }
    }

    protected modifyUI(): void {
        // Prevent re-entrancy
        if (this.isModifying) {
            return;
        }

        if (this.hideAttempts >= this.MAX_HIDE_ATTEMPTS) {
            // Stop observing — we've done enough
            if (this.uiObserver) {
                this.uiObserver.disconnect();
                this.uiObserver = undefined;
            }
            return;
        }
        this.hideAttempts++;
        this.isModifying = true;

        try {
            // Signal to CSS that JS is ready — CSS only hides menus when this is set
            // This prevents menus from being permanently hidden if JS crashes
            document.body.setAttribute('data-airone-ui-ready', 'true');

            // 1. Hide activity bar and sidebar COMPLETELY
            this.hideSidebarAndActivityBar();

            // 2. Hide unwanted menus (whitelist: show only allowed)
            this.hideUnwantedMenus();

            // 3. Remove navigation arrows
            this.removeNavigationArrows();

            // 4. Hide Theia's built-in toolbar
            this.hideTheiaToolbar();

            // 5. Rename Extensions → Libraries
            this.renameExtensionsToLibraries();

            // 6. Make logo bigger
            this.enlargeLogo();

            // 7. Hide unwanted File submenu items (New File, New Folder, etc.)
            this.hideUnwantedFileMenuItems();
        } catch (e) {
            console.error('[AironeIDE] Error during UI modification:', e);
        } finally {
            this.isModifying = false;
        }
    }

    /**
     * Hide Theia's built-in "New File", "New Folder", and other unwanted items
     * from the File dropdown menu. We want only "New Sketch" and "Examples".
     */
    protected hideUnwantedFileMenuItems(): void {
        try {
            // List of command IDs to hide from menus
            const hiddenCommands = [
                'core.newFile',
                'core:newFile',
                'core.newFolder',
                'core:newFolder',
                'core.openFile',
                'core:openFile',
                'workspace:newFile',
                'file.newFile',
            ];

            // Selectors for menu items in dropdown menus (both Lumino and PhosphorJS)
            const menuItemSelectors = [
                '.lm-Menu-item',
                '.p-Menu-item',
                '.theia-Menu-item',
            ];

            for (const sel of menuItemSelectors) {
                try {
                    document.querySelectorAll<HTMLElement>(sel).forEach(item => {
                        try {
                            const dataCommand = item.getAttribute('data-command') || '';
                            if (hiddenCommands.some(cmd => dataCommand === cmd)) {
                                item.style.display = 'none';
                                item.style.height = '0';
                                item.style.padding = '0';
                                item.style.margin = '0';
                                item.style.overflow = 'hidden';
                                item.style.minHeight = '0';
                                item.style.border = 'none';
                            }
                        } catch { /* skip individual item */ }
                    });
                } catch { /* invalid selector */ }
            }

            // Also hide by label text in case data-command is not set
            const hiddenLabels = ['New File', 'New Folder', 'Open File…', 'Open File...'];
            for (const sel of menuItemSelectors) {
                try {
                    document.querySelectorAll<HTMLElement>(sel).forEach(item => {
                        try {
                            const labelEl = item.querySelector('.lm-Menu-itemLabel, .p-Menu-itemLabel, .theia-Menu-itemLabel');
                            const text = labelEl?.textContent?.trim() || item.textContent?.trim() || '';
                            if (hiddenLabels.some(label => text === label)) {
                                item.style.display = 'none';
                                item.style.height = '0';
                                item.style.padding = '0';
                                item.style.margin = '0';
                                item.style.overflow = 'hidden';
                                item.style.minHeight = '0';
                                item.style.border = 'none';
                            }
                        } catch { /* skip individual item */ }
                    });
                } catch { /* invalid selector */ }
            }
        } catch (e) {
            console.error('[AironeIDE] Error hiding file menu items:', e);
        }
    }

    /**
     * WHITELIST APPROACH: All menu items are hidden by CSS rule.
     * We set data-airone-visible="true" on allowed items.
     */
    protected hideUnwantedMenus(): void {
        try {
            const allowed = TheiaIDEContribution.ALLOWED_MENU_LABELS;

            // Selectors for menu bar items
            const menuBarItemSelectors = [
                '.lm-MenuBar-item',
                '.p-MenuBar-item',
                '.theia-MenuBar-item',
            ];

            for (const sel of menuBarItemSelectors) {
                try {
                    document.querySelectorAll<HTMLElement>(sel).forEach(item => {
                        try {
                            const text = this.getMenuItemLabel(item);
                            if (allowed.has(text)) {
                                item.setAttribute('data-airone-visible', 'true');
                            } else {
                                item.removeAttribute('data-airone-visible');
                            }
                        } catch { /* skip */ }
                    });
                } catch { /* invalid selector */ }
            }

            // Also iterate direct children of the menu bar container
            const menuBarSelectors = [
                '.lm-MenuBar',
                '.p-MenuBar',
                '.theia-menubar',
            ];
            for (const sel of menuBarSelectors) {
                try {
                    document.querySelectorAll(sel).forEach(menuBar => {
                        try {
                            // Skip if this is a menu ITEM, not the container
                            if (menuBar.classList.contains('lm-MenuBar-item') ||
                                menuBar.classList.contains('p-MenuBar-item') ||
                                menuBar.classList.contains('theia-MenuBar-item')) {
                                return;
                            }
                            const children = menuBar.children;
                            for (let i = 0; i < children.length; i++) {
                                try {
                                    const child = children[i] as HTMLElement;
                                    const text = this.getMenuItemLabel(child);
                                    if (allowed.has(text)) {
                                        child.setAttribute('data-airone-visible', 'true');
                                    } else {
                                        child.removeAttribute('data-airone-visible');
                                    }
                                } catch { /* skip child */ }
                            }
                        } catch { /* skip menubar */ }
                    });
                } catch { /* invalid selector */ }
            }
        } catch (e) {
            console.error('[AironeIDE] Error hiding menus:', e);
        }
    }

    /**
     * Get the label text of a menu item.
     */
    protected getMenuItemLabel(el: Element): string {
        try {
            // Check for Lumino itemLabel child (most reliable in Theia 1.72+)
            const itemLabel = el.querySelector('.lm-MenuBar-itemLabel, .p-MenuBar-itemLabel');
            if (itemLabel) {
                const text = itemLabel.textContent?.trim();
                if (text) {
                    return text;
                }
            }

            // Check aria-label
            const ariaLabel = el.getAttribute('aria-label');
            if (ariaLabel) {
                return ariaLabel;
            }

            // Check direct text content
            const directText = this.getDirectTextContent(el);
            if (directText) {
                return directText;
            }

            // Fallback
            return el.textContent?.trim() || '';
        } catch (e) {
            return '';
        }
    }

    /**
     * Get the direct text content of an element (not including child elements).
     */
    protected getDirectTextContent(el: Element): string {
        try {
            let text = '';
            for (const node of Array.from(el.childNodes)) {
                if (node.nodeType === Node.TEXT_NODE) {
                    text += node.textContent?.trim() || '';
                } else if (node.nodeType === Node.ELEMENT_NODE) {
                    const htmlNode = node as Element;
                    if (htmlNode.className.includes('label') || htmlNode.className.includes('Label') ||
                        htmlNode.tagName === 'SPAN' || htmlNode.tagName === 'DIV') {
                        if (!htmlNode.className.includes('submenu') && !htmlNode.className.includes('arrow') &&
                            !htmlNode.className.includes('icon') && !htmlNode.className.includes('Icon')) {
                            text += htmlNode.textContent?.trim() || '';
                        }
                    }
                }
            }
            return text.trim();
        } catch (e) {
            return '';
        }
    }

    /**
     * Hide the activity bar and sidebar using aggressive DOM manipulation.
     */
    protected hideSidebarAndActivityBar(): void {
        try {
            // Activity bar selectors — hide (don't remove, to avoid breaking layout)
            const activityBarSelectors = [
                '#theia-activitybar',
                '.theia-activity-bar',
                '.lm-TabBar.theia-activity-bar',
                '.p-TabBar.theia-activity-bar',
            ];

            for (const sel of activityBarSelectors) {
                try {
                    document.querySelectorAll<HTMLElement>(sel).forEach(el => {
                        try {
                            el.style.display = 'none';
                            el.style.width = '0';
                            el.style.minWidth = '0';
                            el.style.overflow = 'hidden';
                            el.style.position = 'absolute';
                            el.style.left = '-9999px';
                            el.style.visibility = 'hidden';
                            el.style.pointerEvents = 'none';
                        } catch { /* skip */ }
                    });
                } catch { /* invalid selector */ }
            }

            // Sidebar panel selectors — hide
            const sidebarSelectors = [
                '.theia-left-side-panel',
                '.theia-side-panel',
                '.theia-sidebar-container',
                '#sidebar-left',
                '#sidebar-left-content',
                'div[data-area="left"]',
            ];

            for (const sel of sidebarSelectors) {
                try {
                    document.querySelectorAll<HTMLElement>(sel).forEach(el => {
                        try {
                            el.style.display = 'none';
                            el.style.width = '0px';
                            el.style.minWidth = '0px';
                            el.style.maxWidth = '0px';
                            el.style.overflow = 'hidden';
                            el.style.position = 'absolute';
                            el.style.left = '-9999px';
                            el.style.visibility = 'hidden';
                            el.style.pointerEvents = 'none';
                        } catch { /* skip */ }
                    });
                } catch { /* invalid selector */ }
            }
        } catch (e) {
            console.error('[AironeIDE] Error hiding sidebar:', e);
        }
    }

    /**
     * Remove back/forward navigation arrows from the toolbar.
     */
    protected removeNavigationArrows(): void {
        try {
            document.querySelectorAll<HTMLElement>('.theia-toolbar-item, [class*="toolbar-item"]').forEach(item => {
                try {
                    const id = item.id || '';
                    const title = item.title || '';
                    const dataCommand = item.getAttribute('data-command') || '';
                    if (
                        id.includes('navigation.back') ||
                        id.includes('navigation.forward') ||
                        dataCommand.includes('navigation.back') ||
                        dataCommand.includes('navigation.forward')
                    ) {
                        item.style.display = 'none';
                    }
                } catch { /* skip */ }
            });
        } catch (e) {
            console.error('[AironeIDE] Error removing nav arrows:', e);
        }
    }

    /**
     * Rename all instances of "Extensions" to "Libraries" in the UI.
     */
    protected renameExtensionsToLibraries(): void {
        try {
            // Activity bar tab labels
            document.querySelectorAll('.lm-TabBar-tabLabel, .p-TabBar-tabLabel').forEach(tab => {
                try {
                    if (tab.textContent?.trim() === 'Extensions') {
                        tab.textContent = 'Libraries';
                    }
                } catch { /* skip */ }
            });

            // Sidebar panel titles
            document.querySelectorAll('.theia-sidepanel-title').forEach(title => {
                try {
                    if (title.textContent?.trim() === 'Extensions') {
                        title.textContent = 'Libraries';
                    }
                } catch { /* skip */ }
            });

            // View container headers
            document.querySelectorAll('.theia-header').forEach(header => {
                try {
                    if (header.textContent?.trim() === 'EXTENSIONS') {
                        header.textContent = 'LIBRARIES';
                    }
                    if (header.textContent?.trim() === 'Extensions') {
                        header.textContent = 'Libraries';
                    }
                } catch { /* skip */ }
            });

            // Tooltip text
            document.querySelectorAll('[title="Extensions"]').forEach(el => {
                try {
                    el.setAttribute('title', 'Libraries');
                } catch { /* skip */ }
            });

            // Tab bar captions
            document.querySelectorAll('.lm-TabBar-tab .lm-TabBar-tabCaption, .p-TabBar-tab .p-TabBar-tabCaption').forEach(caption => {
                try {
                    if (caption.textContent?.trim() === 'Extensions') {
                        caption.textContent = 'Libraries';
                    }
                } catch { /* skip */ }
            });
        } catch (e) {
            console.error('[AironeIDE] Error renaming extensions:', e);
        }
    }

    /**
     * Hide Theia's built-in toolbar (only the toolbar container, NOT the menu bar).
     */
    protected hideTheiaToolbar(): void {
        try {
            const toolbarSelectors = [
                '#theia-toolbar-container',
                '.theia-toolbar-container',
                '#theia-toolbar',
                '.theia-toolbar',
            ];

            for (const sel of toolbarSelectors) {
                try {
                    document.querySelectorAll<HTMLElement>(sel).forEach(el => {
                        try {
                            if (!el.id.startsWith('airo-') && !el.className.includes('airo-')) {
                                el.style.display = 'none';
                                el.style.height = '0';
                                el.style.minHeight = '0';
                                el.style.overflow = 'hidden';
                            }
                        } catch { /* skip */ }
                    });
                } catch { /* invalid selector */ }
            }
        } catch (e) {
            console.error('[AironeIDE] Error hiding toolbar:', e);
        }
    }

    /**
     * Make the logo bigger in the menu bar area.
     */
    protected enlargeLogo(): void {
        try {
            const logoSelectors = [
                '.theia-icon',
                '.theia-menubar-logo',
                '[class*="MenuBar-logo"]',
                '[class*="menubar-logo"]',
                '.lm-MenuBar-logo',
                '.p-MenuBar-logo',
            ];

            for (const sel of logoSelectors) {
                try {
                    document.querySelectorAll<HTMLElement>(sel).forEach(el => {
                        try {
                            const currentWidth = el.style.width;
                            if (currentWidth !== '100px') {
                                el.style.width = '100px';
                                el.style.height = '100px';
                                el.style.minWidth = '100px';
                                el.style.minHeight = '100px';
                                el.style.backgroundSize = '92px 92px';
                                el.style.padding = '4px';
                            }
                        } catch { /* skip */ }
                    });
                } catch { /* invalid selector */ }
            }
        } catch (e) {
            console.error('[AironeIDE] Error enlarging logo:', e);
        }
    }

    registerCommands(commandRegistry: CommandRegistry): void {
        try {
            commandRegistry.registerCommand(TheiaIDECommands.REPORT_ISSUE, {
                execute: () => this.windowService.openNewWindow(TheiaIDEContribution.REPORT_ISSUE_URL, { external: true })
            });
            commandRegistry.registerCommand(TheiaIDECommands.DOCUMENTATION, {
                execute: () => this.windowService.openNewWindow(TheiaIDEContribution.DOCUMENTATION_URL, { external: true })
            });
            commandRegistry.registerCommand(TheiaIDECommands.OPEN_LIBRARIES, {
                execute: () => {
                    commandRegistry.executeCommand('airo.manageLibraries').catch(() => {
                        // Fallback: show a message
                    });
                }
            });
        } catch (e) {
            console.error('[AironeIDE] Error registering commands:', e);
        }
    }

    registerMenus(_menus: MenuModelRegistry): void {
        // Menus are handled by AiroContribution now
    }

    dispose(): void {
        try {
            if (this.debounceTimer) {
                clearTimeout(this.debounceTimer);
                this.debounceTimer = undefined;
            }
            if (this.uiObserver) {
                this.uiObserver.disconnect();
                this.uiObserver = undefined;
            }
        } catch { /* ignore */ }
    }
}
