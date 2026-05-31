/**
 * Airone AI Backbone - Main Process
 * Electron main process that creates the browser window,
 * sets up IPC handlers, starts the brain server, and manages
 * the application lifecycle.
 */

const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const db = require('./database');
const brainServer = require('./brain-server');
const nvidiaClient = require('./nvidia-client');
const renderClient = require('./render-client');

let mainWindow = null;

/**
 * Create the main application window
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    title: 'Airone AI Backbone',
    backgroundColor: '#0a0e27',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    icon: path.join(__dirname, '../../build/icon.png'),
    show: false // Show when ready
  });

  // Load the renderer
  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    mainWindow.loadURL('http://localhost:9000');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    // Load from built files
    const rendererPath = path.join(__dirname, '../renderer/dist/index.html');
    mainWindow.loadFile(rendererPath);
  }

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Set up brain server event forwarding to renderer
  brainServer.setEventCallback((event) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      // Route events to specific channels for the renderer
      switch (event.type) {
        case 'sensor:data':
          mainWindow.webContents.send('brain:sensorData', event);
          break;
        case 'command:sent':
          mainWindow.webContents.send('brain:commandSent', event);
          break;
        case 'client:connected':
        case 'client:disconnected':
          mainWindow.webContents.send('brain:connectionChange', event);
          break;
        default:
          mainWindow.webContents.send('brain:event', event);
          break;
      }
    }
  });
}

/**
 * Set up the application menu
 */
function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Import .airo File',
          accelerator: 'CmdOrCtrl+O',
          click: () => handleOpenAiroFile()
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About Airone AI Backbone',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About',
              message: 'Airone AI Backbone v0.1.0',
              detail: 'Desktop application for robot AI control.\nPart of the Airone Robotics System.'
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

/**
 * Handle opening .airo files
 */
async function handleOpenAiroFile() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import .airo File',
    filters: [
      { name: 'Airone Robot Files', extensions: ['airo'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['openFile']
  });

  if (result.canceled || result.filePaths.length === 0) return null;
  
  const filePath = result.filePaths[0];
  const content = fs.readFileSync(filePath, 'utf-8');
  const { pins, robotName } = db.parseAiroPins(content);
  
  return { filePath, content, pins, robotName };
}

// ==================== IPC HANDLERS ====================

function setupIpcHandlers() {
  // ---- Robot Operations ----
  ipcMain.handle('db:createRobot', async (_event, robotData) => {
    return db.createRobot(robotData);
  });

  ipcMain.handle('db:getRobot', async (_event, id) => {
    return db.getRobot(id);
  });

  ipcMain.handle('db:getRobotByName', async (_event, name) => {
    return db.getRobotByName(name);
  });

  ipcMain.handle('db:getAllRobots', async () => {
    return db.getAllRobots();
  });

  ipcMain.handle('db:updateRobot', async (_event, id, robotData) => {
    return db.updateRobot(id, robotData);
  });

  ipcMain.handle('db:deleteRobot', async (_event, id) => {
    return db.deleteRobot(id);
  });

  // ---- Pin Operations ----
  ipcMain.handle('db:syncPins', async (_event, robotId, pins) => {
    return db.syncPins(robotId, pins);
  });

  ipcMain.handle('db:getPins', async (_event, robotId) => {
    return db.getPins(robotId);
  });

  ipcMain.handle('db:updatePinDescription', async (_event, pinId, description) => {
    return db.updatePinDescription(pinId, description);
  });

  ipcMain.handle('file:parseAiro', async (_event, filePath) => {
    const content = fs.readFileSync(filePath, 'utf-8');
    const { pins, robotName } = db.parseAiroPins(content);
    return { content, pins, robotName };
  });

  // ---- Command Log Operations ----
  ipcMain.handle('db:getCommandLogs', async (_event, robotId, limit) => {
    return db.getCommandLogs(robotId, limit);
  });

  ipcMain.handle('db:clearCommandLogs', async (_event, robotId) => {
    return db.clearCommandLogs(robotId);
  });

  // ---- AI Config Operations ----
  ipcMain.handle('db:saveAiConfig', async (_event, robotId, config) => {
    return db.saveAiConfig(robotId, config);
  });

  ipcMain.handle('db:getActiveAiConfig', async (_event, robotId) => {
    return db.getActiveAiConfig(robotId);
  });

  // ---- Brain Server Operations ----
  ipcMain.handle('brain:start', async (_event, port, host) => {
    return brainServer.start(port, host);
  });

  ipcMain.handle('brain:stop', async () => {
    return brainServer.stop();
  });

  ipcMain.handle('brain:status', async () => {
    return brainServer.getStatus();
  });

  ipcMain.handle('brain:emergencyStop', async (_event, robotId) => {
    return brainServer.emergencyStop(robotId);
  });

  ipcMain.handle('brain:releaseEmergencyStop', async (_event, robotId) => {
    return brainServer.releaseEmergencyStop(robotId);
  });

  // ---- File Operations ----
  ipcMain.handle('file:openAiro', async () => {
    return handleOpenAiroFile();
  });

  // ---- AI Chat Operations ----
  ipcMain.handle('ai:sendChat', async (_event, { robotId, messages, pins, robotData }) => {
    try {
      // Save user message(s) to chat history
      for (const msg of messages) {
        if (msg.role === 'user') {
          db.saveChatMessage(robotId, 'user', msg.content);
        }
      }

      // Call NVIDIA API for chat completion
      const assistantContent = await nvidiaClient.sendChatCompletion({
        messages,
        model: robotData?.ai_model
      });

      // Save assistant message to chat history
      db.saveChatMessage(robotId, 'assistant', assistantContent);

      return { content: assistantContent, role: 'assistant' };
    } catch (err) {
      console.error('[Main] AI chat error:', err.message);
      throw new Error(`AI chat failed: ${err.message}`);
    }
  });

  ipcMain.handle('ai:generateLnnModel', async (_event, { robotId, robotData, pins, messages }) => {
    try {
      // Call NVIDIA API for LNN model generation
      const modelConfig = await nvidiaClient.generateLnnModel({
        robotData,
        pins,
        conversationHistory: messages || []
      });

      // Save the model to database
      const savedModel = db.saveLnnModel(robotId, modelConfig);

      return { modelConfig, modelId: savedModel.id };
    } catch (err) {
      console.error('[Main] LNN generation error:', err.message);
      throw new Error(`LNN model generation failed: ${err.message}`);
    }
  });

  // ---- LNN Model Generation with SSE Streaming ----
  ipcMain.handle('ai:generateLnnModelStream', async (event, params) => {
    const { robotId, robotData, pins, messages } = params;

    const DEPLOY_API = 'https://airone-deploy.onrender.com';

    // Build the request body
    const inputPins = (pins || []).filter(p => p.mode === 'input');
    const outputPins = (pins || []).filter(p => p.mode === 'output');

    const requestBody = {
      user_id: 'default',
      robot_name: robotData?.name || 'my-robot',
      description: robotData?.description || (messages || []).map(m => m.content).join(' '),
      pin_definitions: {
        inputs: inputPins.map(p => ({ name: p.pin_name || p.name, pin: p.pin_number || p.number, type: 'analog_input' })),
        outputs: outputPins.map(p => ({ name: p.pin_name || p.name, pin: p.pin_number || p.number, type: p.mode === 'pwm' ? 'pwm_output' : 'digital_output' }))
      },
      sensor_count: inputPins.length,
      actuator_count: outputPins.length
    };

    try {
      const response = await fetch(`${DEPLOY_API}/generate/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalResult = null;
      let currentEvent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
            continue;
          }
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              // Add event type to data if present
              if (currentEvent) {
                data.eventType = currentEvent;
              }

              // Forward progress to renderer
              event.sender.send('ai:generateProgress', data);

              // Check for completion
              if (data.step === 'complete' || data.model_id) {
                finalResult = data;
              }
            } catch (e) {
              // Ignore parse errors for non-JSON data lines
            }
            currentEvent = ''; // Reset event type after processing data
          }
        }
      }

      // Process any remaining data in buffer
      if (buffer.startsWith('data: ')) {
        try {
          const data = JSON.parse(buffer.slice(6));
          event.sender.send('ai:generateProgress', data);
          if (data.step === 'complete' || data.model_id) {
            finalResult = data;
          }
        } catch (e) {
          // Ignore parse errors
        }
      }

      // Save the generated model to database if we have a robotId
      if (finalResult && robotId && finalResult.config) {
        try {
          const savedModel = db.saveLnnModel(robotId, finalResult.config);
          finalResult.model_id = finalResult.model_id || savedModel.id;
        } catch (e) {
          console.warn('[Main] Failed to save streamed LNN model:', e.message);
        }
      }

      return finalResult || { status: 'generated', model_id: 'unknown' };
    } catch (e) {
      console.error('[Main] SSE generation error:', e.message);

      // Fallback to non-streaming endpoint
      try {
        const fallbackResponse = await fetch(`${DEPLOY_API}/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });

        if (!fallbackResponse.ok) {
          throw new Error(`Fallback API returned ${fallbackResponse.status}`);
        }

        const fallbackResult = await fallbackResponse.json();

        // Send progress event for the completed result
        event.sender.send('ai:generateProgress', {
          step: 'complete',
          progress: 100,
          model_id: fallbackResult.model_id || fallbackResult.id,
          config: fallbackResult.config,
          accuracy: fallbackResult.accuracy
        });

        // Save to database
        if (robotId && fallbackResult.config) {
          try {
            const savedModel = db.saveLnnModel(robotId, fallbackResult.config);
            fallbackResult.model_id = fallbackResult.model_id || savedModel.id;
          } catch (e2) {
            console.warn('[Main] Failed to save fallback LNN model:', e2.message);
          }
        }

        return fallbackResult;
      } catch (e2) {
        throw new Error(`Generation failed: ${e2.message}`);
      }
    }
  });

  ipcMain.handle('ai:getChatHistory', async (_event, robotId) => {
    return db.getChatHistory(robotId);
  });

  ipcMain.handle('ai:clearChatHistory', async (_event, robotId) => {
    return db.clearChatHistory(robotId);
  });

  // ---- Deploy Operations ----
  ipcMain.handle('deploy:brainService', async (_event, { robotId, modelConfig }) => {
    try {
      // Get robot data for the service name
      const robot = db.getRobot(robotId);
      if (!robot) {
        throw new Error('Robot not found');
      }

      // Update model status to 'deploying'
      const latestModel = db.getLatestLnnModel(robotId);
      if (latestModel) {
        db.updateLnnModelStatus(latestModel.id, 'deploying');
      }

      // Deploy to Render
      const deployResult = await renderClient.deployBrainService({
        robotId,
        robotName: robot.name,
        modelConfig
      });

      // Update model status and deployment info in database
      if (latestModel) {
        db.updateLnnModelStatus(
          latestModel.id,
          'deployed',
          deployResult.brain_url,
          deployResult.api_key,
          deployResult.service_id
        );
      }

      // Update robot with brain URL and API key
      db.updateRobot(robotId, {
        brain_url: deployResult.brain_url,
        api_key: deployResult.api_key
      });

      return {
        brain_url: deployResult.brain_url,
        api_key: deployResult.api_key,
        service_id: deployResult.service_id
      };
    } catch (err) {
      // Update model status to 'failed' if deploy fails
      const latestModel = db.getLatestLnnModel(robotId);
      if (latestModel) {
        db.updateLnnModelStatus(latestModel.id, 'failed');
      }
      console.error('[Main] Deploy error:', err.message);
      throw new Error(`Brain service deployment failed: ${err.message}`);
    }
  });

  ipcMain.handle('deploy:getStatus', async (_event, serviceId) => {
    try {
      return await renderClient.getServiceStatus(serviceId);
    } catch (err) {
      console.error('[Main] Get deploy status error:', err.message);
      throw new Error(`Failed to get deploy status: ${err.message}`);
    }
  });

  // ---- LNN Model Operations ----
  ipcMain.handle('db:getLnnModels', async (_event, robotId) => {
    return db.getLnnModels(robotId);
  });

  ipcMain.handle('db:getLatestLnnModel', async (_event, robotId) => {
    return db.getLatestLnnModel(robotId);
  });
}

// ==================== APP LIFECYCLE ====================

app.whenReady().then(async () => {
  // Initialize database (async for sql.js)
  await db.initDatabase();

  // Set up IPC handlers
  setupIpcHandlers();

  // Create window
  createWindow();

  // Create menu
  createMenu();

  // Start brain server automatically
  const defaultPort = parseInt(process.env.BRAIN_PORT || '8080', 10);
  brainServer.start(defaultPort, '0.0.0.0');
  console.log(`[Main] Brain server auto-started on port ${defaultPort}`);

  // macOS: recreate window when dock icon clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Cleanup on quit
app.on('before-quit', () => {
  console.log('[Main] Shutting down...');
  brainServer.stop();
  db.closeDatabase();
});

// Security: Prevent new window creation
app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });
});
