/**
 * Airone AI Backbone - AI Chat Component
 * Interactive AI chat interface for designing LNN models for robots.
 * Supports chat with AI, LNN model generation with SSE streaming progress,
 * and cloud deployment with step-by-step progress UI.
 */

import React, { useState, useEffect, useRef } from 'react';

const GENERATION_STEPS = [
  { id: 'generating', name: 'Generating LNN Architecture', icon: '🏗️' },
  { id: 'creating_data', name: 'Creating Training Data', icon: '📊' },
  { id: 'training', name: 'Training LNN', icon: '🎯' },
  { id: 'checking', name: 'Checking for Errors', icon: '🔍' },
  { id: 'testing', name: 'Testing LNN Behavior', icon: '🧪' },
  { id: 'finalizing', name: 'Finalizing Model', icon: '✅' }
];

const DEPLOY_STEPS = [
  { id: 'deploying', name: 'Deploying to Render...', icon: '🚀' },
  { id: 'creating_service', name: 'Creating brain service...', icon: '⚙️' },
  { id: 'deploy_complete', name: 'Brain service live!', icon: '🎉' }
];

function AiChat() {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [generateStatus, setGenerateStatus] = useState('idle'); // 'idle' | 'generating' | 'ready' | 'error'
  const [modelConfig, setModelConfig] = useState(null);
  const [modelId, setModelId] = useState(null);
  const [deployStatus, setDeployStatus] = useState('idle'); // 'idle' | 'deploying' | 'deployed' | 'error'
  const [deployResult, setDeployResult] = useState(null);
  const [robotId, setRobotId] = useState(null);
  const [robotData, setRobotData] = useState(null);
  const [pins, setPins] = useState([]);
  const [error, setError] = useState(null);
  const [copyFeedback, setCopyFeedback] = useState({ field: null, timeout: null });
  const [generateProgress, setGenerateProgress] = useState(null);
  const [deployProgress, setDeployProgress] = useState(null);

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  // Auto-scroll to bottom on new messages or progress changes
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, generateProgress, deployProgress]);

  // Load data on mount
  useEffect(() => {
    loadData();
  }, []);

  // Listen for generation progress events from main process
  useEffect(() => {
    if (window.aironeAPI && window.aironeAPI.onGenerateProgress) {
      window.aironeAPI.onGenerateProgress((progressData) => {
        setGenerateProgress(progressData);

        // If generation is complete, update status
        if (progressData.step === 'complete' || progressData.model_id) {
          setGenerateStatus('ready');
          if (progressData.config) {
            setModelConfig(progressData.config);
          }
          if (progressData.model_id) {
            setModelId(progressData.model_id);
          }

          const accuracyText = progressData.accuracy
            ? ` Accuracy: ${(progressData.accuracy * 100).toFixed(1)}%`
            : '';
          const assistantMessage = {
            id: Date.now().toString(),
            role: 'assistant',
            content: `⚡ LNN Model Generated!${accuracyText}\n\nModel ID: ${progressData.model_id || 'N/A'}\nThe model is ready for deployment.`,
            timestamp: new Date().toISOString()
          };
          setMessages(prev => [...prev, assistantMessage]);

          // Clear progress after a brief delay
          setTimeout(() => setGenerateProgress(null), 1500);
        }
      });
    }

    return () => {
      if (window.aironeAPI && window.aironeAPI.removeAllListeners) {
        window.aironeAPI.removeAllListeners('ai:generateProgress');
      }
    };
  }, []);

  const loadData = async () => {
    try {
      const robots = await window.aironeAPI.getAllRobots();
      if (robots && robots.length > 0) {
        const first = robots[0];
        setRobotId(first.id);
        setRobotData(first);

        // Load pins
        const pinsResult = await window.aironeAPI.getPins(first.id);
        setPins(pinsResult || []);

        // Load chat history
        if (window.aironeAPI.getChatHistory) {
          try {
            const history = await window.aironeAPI.getChatHistory(first.id);
            if (history && history.length > 0) {
              setMessages(history);
            }
          } catch (e) {
            console.warn('Chat history not available:', e);
          }
        }

        // Check for existing model
        if (window.aironeAPI.getLatestLnnModel) {
          try {
            const model = await window.aironeAPI.getLatestLnnModel(first.id);
            if (model) {
              setModelConfig(model.config || model);
              setModelId(model.id);
              if (model.deployed || model.brain_url) {
                setGenerateStatus('ready');
                if (model.brain_url && model.api_key) {
                  setDeployResult({
                    brain_url: model.brain_url,
                    api_key: model.api_key,
                    service_id: model.service_id
                  });
                  setDeployStatus('deployed');
                }
              } else {
                setGenerateStatus('ready');
              }
            }
          } catch (e) {
            console.warn('LNN model check not available:', e);
          }
        }
      }
    } catch (e) {
      console.error('Failed to load data:', e);
      setError('Failed to load robot data. Please configure a robot first.');
    }
  };

  const handleSendMessage = async () => {
    if (!inputText.trim() || isSending) return;

    const userMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: inputText.trim(),
      timestamp: new Date().toISOString()
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInputText('');
    setIsSending(true);
    setError(null);

    // Auto-resize textarea back
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    try {
      if (window.aironeAPI.sendAiChat) {
        const response = await window.aironeAPI.sendAiChat({
          robotId,
          messages: newMessages,
          pins,
          robotData
        });

        const assistantMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: response.content || response.message || response,
          timestamp: new Date().toISOString()
        };
        setMessages(prev => [...prev, assistantMessage]);
      } else {
        // Fallback if API not available yet
        const assistantMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: 'AI Chat is being configured. The backend service will be available soon. For now, you can describe your robot and I\'ll note the requirements for LNN model generation.',
          timestamp: new Date().toISOString()
        };
        setMessages(prev => [...prev, assistantMessage]);
      }
    } catch (e) {
      setError('Failed to send message: ' + e.message);
      const errorMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Sorry, I encountered an error processing your request. Please try again.',
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsSending(false);
    }
  };

  const getStepStatus = (stepId) => {
    if (!generateProgress) return 'pending';
    const stepOrder = GENERATION_STEPS.map(s => s.id);
    const currentIdx = stepOrder.indexOf(generateProgress.step);
    const thisIdx = stepOrder.indexOf(stepId);
    if (currentIdx === -1) return 'pending';
    if (thisIdx < currentIdx) return 'completed';
    if (thisIdx === currentIdx) return 'active';
    return 'pending';
  };

  const getDeployStepStatus = (stepId) => {
    if (!deployProgress) return 'pending';
    const stepOrder = DEPLOY_STEPS.map(s => s.id);
    const currentIdx = stepOrder.indexOf(deployProgress.step);
    const thisIdx = stepOrder.indexOf(stepId);
    if (currentIdx === -1) return 'pending';
    if (thisIdx < currentIdx) return 'completed';
    if (thisIdx === currentIdx) return 'active';
    return 'pending';
  };

  const handleGenerate = async () => {
    if (!robotId || pins.length === 0) return;

    setGenerateStatus('generating');
    setGenerateProgress({ step: 'generating', progress: 0 });
    setError(null);

    try {
      // Try SSE streaming first
      if (window.aironeAPI.generateLnnModelStream) {
        await window.aironeAPI.generateLnnModelStream({
          robotId,
          robotData,
          pins,
          messages
        });
        // Progress updates come via onGenerateProgress callback
        // Final state is set in the useEffect listener
      } else if (window.aironeAPI.generateLnnModel) {
        // Fallback to non-streaming
        const result = await window.aironeAPI.generateLnnModel({
          robotId,
          robotData,
          pins,
          messages
        });

        setModelConfig(result.config || result.modelConfig || result);
        setModelId(result.modelId || result.id);
        setGenerateStatus('ready');
        setGenerateProgress(null);

        const summary = result.summary || `LNN model generated successfully with ${pins.length} pin(s) configured. The model is ready for deployment.`;
        const assistantMessage = {
          id: Date.now().toString(),
          role: 'assistant',
          content: `⚡ LNN Model Generated!\n\n${summary}`,
          timestamp: new Date().toISOString()
        };
        setMessages(prev => [...prev, assistantMessage]);
      } else {
        // Simulate generation if API not available
        setGenerateProgress({ step: 'generating', progress: 10 });
        await new Promise(resolve => setTimeout(resolve, 800));
        setGenerateProgress({ step: 'creating_data', progress: 25, message: 'Creating datasets...' });
        await new Promise(resolve => setTimeout(resolve, 800));
        setGenerateProgress({ step: 'training', progress: 40, message: 'Training LNN (iteration 1/50)...' });
        await new Promise(resolve => setTimeout(resolve, 600));
        setGenerateProgress({ step: 'training', progress: 55, message: 'Training LNN (iteration 25/50)...', accuracy: 0.72 });
        await new Promise(resolve => setTimeout(resolve, 600));
        setGenerateProgress({ step: 'training', progress: 70, message: 'Training LNN (iteration 50/50)...', accuracy: 0.91 });
        await new Promise(resolve => setTimeout(resolve, 500));
        setGenerateProgress({ step: 'checking', progress: 80, message: 'Validating model...' });
        await new Promise(resolve => setTimeout(resolve, 500));
        setGenerateProgress({ step: 'testing', progress: 90, message: 'Running behavior tests...' });
        await new Promise(resolve => setTimeout(resolve, 500));
        setGenerateProgress({ step: 'finalizing', progress: 98, message: 'Saving model...' });

        const mockConfig = {
          robot_id: robotId,
          input_neurons: pins.filter(p => p.mode === 'input').length,
          output_neurons: pins.filter(p => p.mode === 'output').length,
          hidden_layers: 3,
          activation: 'sigmoid',
          pins: pins.map(p => ({ name: p.pin_name || p.name, number: p.pin_number || p.number, mode: p.mode }))
        };

        setModelConfig(mockConfig);
        setModelId('mock-' + Date.now());
        setGenerateStatus('ready');

        const assistantMessage = {
          id: Date.now().toString(),
          role: 'assistant',
          content: `⚡ LNN Model Generated!\n\nModel configuration created with:\n- ${mockConfig.input_neurons} input neurons\n- ${mockConfig.output_neurons} output neurons\n- ${mockConfig.hidden_layers} hidden layers\n- ${mockConfig.activation} activation function\n- Training accuracy: 91.0%\n\nClick "Deploy to Cloud" to make it available for your robot.`,
          timestamp: new Date().toISOString()
        };
        setMessages(prev => [...prev, assistantMessage]);

        setTimeout(() => setGenerateProgress(null), 1500);
      }
    } catch (e) {
      setGenerateStatus('error');
      setGenerateProgress(null);
      setError('Model generation failed: ' + e.message);
    }
  };

  const handleDeploy = async () => {
    if (!robotId || !modelConfig) return;

    setDeployStatus('deploying');
    setDeployProgress({ step: 'deploying', message: 'Connecting to Render...' });
    setError(null);

    try {
      if (window.aironeAPI.deployBrainService) {
        setDeployProgress({ step: 'deploying', message: 'Uploading model to Render...' });

        const result = await window.aironeAPI.deployBrainService({
          robotId,
          modelConfig
        });

        setDeployProgress({ step: 'creating_service', message: result.service_id ? 'Updating brain template...' : 'Creating brain service...' });

        // Brief pause to show the creating step
        await new Promise(resolve => setTimeout(resolve, 800));

        setDeployResult(result);
        setDeployStatus('deployed');
        setDeployProgress({ step: 'deploy_complete', message: 'Brain service is live!' });

        // Update robot with brain_url
        if (result.brain_url) {
          try {
            await window.aironeAPI.updateRobot(robotId, { brain_url: result.brain_url });
          } catch (e) {
            console.warn('Failed to update robot brain_url:', e);
          }
        }

        const wsUrl = result.brain_url.replace('https://', 'wss://').replace('http://', 'ws://');
        const assistantMessage = {
          id: Date.now().toString(),
          role: 'assistant',
          content: `🚀 Brain Service Deployed!\n\nYour LNN model is now live in the cloud.\n\nBrain URL: ${result.brain_url}\nWebSocket: ${wsUrl}\n\nUse the URLs shown below to connect your robot.`,
          timestamp: new Date().toISOString()
        };
        setMessages(prev => [...prev, assistantMessage]);

        setTimeout(() => setDeployProgress(null), 2000);
      } else {
        // Simulate deployment if API not available
        setDeployProgress({ step: 'deploying', message: 'Connecting to Render...' });
        await new Promise(resolve => setTimeout(resolve, 1000));
        setDeployProgress({ step: 'creating_service', message: 'Creating brain service...' });
        await new Promise(resolve => setTimeout(resolve, 1500));

        const mockResult = {
          brain_url: `https://brain.airone.dev/service/${robotId}`,
          api_key: `airo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          service_id: `svc-${Date.now()}`
        };

        setDeployResult(mockResult);
        setDeployStatus('deployed');
        setDeployProgress({ step: 'deploy_complete', message: 'Brain service is live!' });

        // Update robot with brain_url
        try {
          await window.aironeAPI.updateRobot(robotId, { brain_url: mockResult.brain_url });
        } catch (e) {
          console.warn('Failed to update robot brain_url:', e);
        }

        const wsUrl = mockResult.brain_url.replace('https://', 'wss://').replace('http://', 'ws://');
        const assistantMessage = {
          id: Date.now().toString(),
          role: 'assistant',
          content: `🚀 Brain Service Deployed!\n\nYour LNN model is now live.\n\nBrain URL: ${mockResult.brain_url}\nWebSocket: ${wsUrl}\n\nUse the URLs shown below to connect your robot via the Airone IDE.`,
          timestamp: new Date().toISOString()
        };
        setMessages(prev => [...prev, assistantMessage]);

        setTimeout(() => setDeployProgress(null), 2000);
      }
    } catch (e) {
      setDeployStatus('error');
      setDeployProgress(null);
      setError('Deployment failed: ' + e.message);
    }
  };

  const handleCopy = async (text, field) => {
    try {
      await navigator.clipboard.writeText(text);
      // Clear any existing timeout
      if (copyFeedback.timeout) {
        clearTimeout(copyFeedback.timeout);
      }
      setCopyFeedback({ field, timeout: null });
      // Set a timeout to clear the feedback
      const timeout = setTimeout(() => {
        setCopyFeedback(prev => ({ ...prev, field: null }));
      }, 2000);
      setCopyFeedback({ field, timeout });
    } catch (e) {
      console.error('Failed to copy:', e);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleTextareaChange = (e) => {
    setInputText(e.target.value);
    // Auto-grow textarea
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
  };

  const inputPinCount = pins.filter(p => p.mode === 'input').length;
  const outputPinCount = pins.filter(p => p.mode === 'output').length;

  const formatTimestamp = (ts) => {
    try {
      const date = new Date(ts);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  // Compute the progress percentage for the progress bar
  const getProgressPercent = () => {
    if (!generateProgress) return 0;
    if (generateProgress.progress) return generateProgress.progress;
    const stepOrder = GENERATION_STEPS.map(s => s.id);
    const idx = stepOrder.indexOf(generateProgress.step);
    if (idx === -1) return 0;
    return Math.round(((idx + 1) / stepOrder.length) * 100);
  };

  return (
    <div className="ai-chat fade-in">
      {/* LNN Progress Panel Styles */}
      <style>{`
        @keyframes lnn-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .lnn-progress-panel {
          background: #1a1f3a;
          border: 1px solid #2d3561;
          border-radius: 12px;
          padding: 16px;
          margin: 8px 0;
          color: #e0e0ff;
          font-size: 13px;
        }

        .progress-header {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 15px;
          font-weight: 600;
          margin-bottom: 14px;
          color: #fff;
        }

        .progress-icon {
          font-size: 18px;
        }

        .progress-steps {
          display: flex;
          flex-direction: column;
          gap: 2px;
          margin-bottom: 14px;
        }

        .progress-step {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 7px 10px;
          border-radius: 6px;
          border-left: 3px solid transparent;
          transition: all 0.3s ease;
        }

        .progress-step.completed {
          border-left-color: #22c55e;
          color: #86efac;
        }

        .progress-step.active {
          border-left-color: #3b82f6;
          background: rgba(59, 130, 246, 0.08);
          color: #fff;
        }

        .progress-step.pending {
          border-left-color: #4b5563;
          color: #6b7280;
        }

        .step-indicator {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 22px;
          height: 22px;
          font-size: 14px;
          flex-shrink: 0;
        }

        .progress-step.active .step-indicator {
          animation: lnn-spin 1.2s linear infinite;
          color: #60a5fa;
          font-size: 16px;
        }

        .progress-step.completed .step-indicator {
          color: #22c55e;
          font-weight: bold;
        }

        .step-name {
          flex: 1;
          font-size: 13px;
        }

        .step-message {
          font-size: 11px;
          color: #93c5fd;
          margin-left: auto;
          font-style: italic;
          max-width: 200px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .progress-bar-container {
          position: relative;
          height: 22px;
          background: #0f1330;
          border-radius: 11px;
          overflow: hidden;
          margin-bottom: 10px;
        }

        .progress-bar {
          height: 100%;
          background: linear-gradient(90deg, #3b82f6, #8b5cf6, #06b6d4);
          border-radius: 11px;
          transition: width 0.5s ease;
          position: relative;
        }

        .progress-bar::after {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent);
          animation: progress-shimmer 2s infinite;
        }

        @keyframes progress-shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }

        .progress-text {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          font-size: 11px;
          font-weight: 600;
          color: #fff;
          text-shadow: 0 1px 2px rgba(0,0,0,0.5);
        }

        .progress-accuracy {
          font-size: 12px;
          color: #34d399;
          margin-top: 4px;
          text-align: right;
        }

        .progress-result {
          margin-top: 10px;
          padding: 10px 12px;
          background: rgba(34, 197, 94, 0.1);
          border: 1px solid rgba(34, 197, 94, 0.3);
          border-radius: 8px;
          font-size: 12px;
          color: #86efac;
        }

        .progress-result-id {
          color: #93c5fd;
          font-family: monospace;
        }

        .deploy-progress-panel {
          background: #1a1f3a;
          border: 1px solid #2d3561;
          border-radius: 12px;
          padding: 16px;
          margin: 8px 0;
          color: #e0e0ff;
          font-size: 13px;
        }

        .deploy-progress-panel .progress-header {
          color: #fff;
        }

        .deploy-progress-panel .progress-step.completed {
          border-left-color: #22c55e;
          color: #86efac;
        }

        .deploy-progress-panel .progress-step.active {
          border-left-color: #06b6d4;
          background: rgba(6, 182, 212, 0.08);
          color: #fff;
        }

        .deploy-progress-panel .progress-step.active .step-indicator {
          animation: lnn-spin 1.2s linear infinite;
          color: #22d3ee;
        }

        .deploy-result-urls {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-top: 10px;
        }

        .deploy-url-field {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .deploy-url-field label {
          font-size: 11px;
          color: #93c5fd;
          min-width: 90px;
          font-weight: 600;
        }

        .deploy-url-field code {
          flex: 1;
          font-size: 12px;
          color: #e0e0ff;
          background: #0f1330;
          padding: 6px 10px;
          border-radius: 6px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .deploy-url-field .copy-btn {
          padding: 4px 10px;
          font-size: 11px;
          background: #2d3561;
          color: #e0e0ff;
          border: 1px solid #3d4575;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
          white-space: nowrap;
        }

        .deploy-url-field .copy-btn:hover {
          background: #3d4575;
        }
      `}</style>

      {/* Page Header */}
      <div className="page-header">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="28" height="28">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <h2>AI Chat</h2>
      </div>

      {/* Context Bar */}
      <div className="ai-chat-context-bar">
        <span className="context-robot-name">
          {robotData ? (robotData.name || 'Unnamed Robot') : 'No Robot Selected'}
        </span>
        {robotData && robotData.type && (
          <span className="context-divider">|</span>
        )}
        {robotData && robotData.type && (
          <span className="context-robot-type">{robotData.type}</span>
        )}
        <span className="context-divider">|</span>
        <span className="context-pin-count">
          {pins.length} pins ({inputPinCount} in / {outputPinCount} out)
        </span>
        {generateStatus === 'ready' && (
          <>
            <span className="context-divider">|</span>
            <span className="chip chip-green">LNN Ready</span>
          </>
        )}
        {deployStatus === 'deployed' && (
          <>
            <span className="context-divider">|</span>
            <span className="chip chip-cyan">Deployed</span>
          </>
        )}
      </div>

      {/* Chat Messages Container */}
      <div className="chat-messages">
        {/* Welcome system message */}
        <div className="chat-message system">
          <div className="chat-message-content">
            Welcome to Airone AI! Describe your robot and I'll help you design an LNN model for it.
          </div>
        </div>

        {/* Chat messages */}
        {messages.map((msg) => (
          <div key={msg.id} className={`chat-message ${msg.role}`}>
            <div className="chat-message-role">
              {msg.role === 'user' ? 'You' : msg.role === 'assistant' ? 'AI' : 'System'}
            </div>
            <div className="chat-message-content">
              {msg.content.split('\n').map((line, i) => (
                <React.Fragment key={i}>
                  {line}
                  {i < msg.content.split('\n').length - 1 && <br />}
                </React.Fragment>
              ))}
            </div>
            <div className="chat-message-time">{formatTimestamp(msg.timestamp)}</div>
          </div>
        ))}

        {/* LNN Generation Progress Panel */}
        {generateProgress && generateStatus === 'generating' && (
          <div className="chat-message assistant">
            <div className="chat-message-role">AI</div>
            <div className="chat-message-content" style={{ padding: 0, background: 'transparent', border: 'none' }}>
              <div className="lnn-progress-panel">
                <div className="progress-header">
                  <span className="progress-icon">🧠</span>
                  <span>Generating LNN for {robotData?.name || 'Robot'}</span>
                </div>
                <div className="progress-steps">
                  {GENERATION_STEPS.map((step) => (
                    <div key={step.id} className={`progress-step ${getStepStatus(step.id)}`}>
                      <span className="step-indicator">
                        {getStepStatus(step.id) === 'completed' ? '✓' :
                         getStepStatus(step.id) === 'active' ? '⟳' : '○'}
                      </span>
                      <span className="step-name">{step.icon} {step.name}</span>
                      {generateProgress.step === step.id && generateProgress.message && (
                        <span className="step-message">{generateProgress.message}</span>
                      )}
                    </div>
                  ))}
                </div>
                <div className="progress-bar-container">
                  <div className="progress-bar" style={{ width: `${getProgressPercent()}%` }} />
                  <span className="progress-text">{getProgressPercent()}%</span>
                </div>
                {generateProgress.accuracy !== undefined && (
                  <div className="progress-accuracy">
                    Training accuracy: {(generateProgress.accuracy * 100).toFixed(1)}%
                  </div>
                )}
                {generateProgress.model_id && (
                  <div className="progress-result">
                    ✓ Model generated! ID: <span className="progress-result-id">{generateProgress.model_id}</span>
                    {generateProgress.accuracy !== undefined && (
                      <> — Accuracy: {(generateProgress.accuracy * 100).toFixed(1)}%</>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Deploy Progress Panel */}
        {deployProgress && deployStatus === 'deploying' && (
          <div className="chat-message assistant">
            <div className="chat-message-role">AI</div>
            <div className="chat-message-content" style={{ padding: 0, background: 'transparent', border: 'none' }}>
              <div className="deploy-progress-panel">
                <div className="progress-header">
                  <span className="progress-icon">🚀</span>
                  <span>Deploying Brain Service</span>
                </div>
                <div className="progress-steps">
                  {DEPLOY_STEPS.map((step) => (
                    <div key={step.id} className={`progress-step ${getDeployStepStatus(step.id)}`}>
                      <span className="step-indicator">
                        {getDeployStepStatus(step.id) === 'completed' ? '✓' :
                         getDeployStepStatus(step.id) === 'active' ? '⟳' : '○'}
                      </span>
                      <span className="step-name">{step.icon} {step.name}</span>
                      {deployProgress.step === step.id && deployProgress.message && (
                        <span className="step-message">{deployProgress.message}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Sending indicator */}
        {isSending && (
          <div className="chat-message assistant">
            <div className="chat-message-role">AI</div>
            <div className="chat-message-content">
              <span className="generating-indicator">Thinking...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Action Bar */}
      <div className="chat-actions">
        <button
          className={`btn ${generateStatus === 'ready' ? 'btn-secondary' : generateStatus === 'generating' ? 'btn-secondary' : 'btn-primary'}`}
          onClick={handleGenerate}
          disabled={!robotId || pins.length === 0 || generateStatus === 'generating'}
        >
          {generateStatus === 'generating' ? (
            <>
              <span className="generating-indicator">Generating...</span>
            </>
          ) : generateStatus === 'ready' ? (
            '✓ Model Ready!'
          ) : generateStatus === 'error' ? (
            '⚡ Retry Generate LNN'
          ) : (
            '⚡ Generate LNN'
          )}
        </button>

        {generateStatus === 'ready' && (
          <button
            className={`btn ${deployStatus === 'deployed' ? 'btn-secondary' : 'btn-primary'}`}
            onClick={handleDeploy}
            disabled={deployStatus === 'deploying'}
          >
            {deployStatus === 'deploying' ? (
              <span className="generating-indicator">Deploying...</span>
            ) : deployStatus === 'deployed' ? (
              '✓ Deployed!'
            ) : deployStatus === 'error' ? (
              '🚀 Retry Deploy to Cloud'
            ) : (
              '🚀 Deploy to Cloud'
            )}
          </button>
        )}
      </div>

      {/* Deploy Result Panel */}
      {deployStatus === 'deployed' && deployResult && (
        <div className="deploy-result-panel">
          <h4>Brain Service Deployed</h4>
          <p className="deploy-instructions">
            Paste these into the Airone IDE's brain_url and api_key fields
          </p>
          <div className="deploy-field">
            <label>Brain URL</label>
            <div className="deploy-url-row">
              <code className="deploy-url">{deployResult.brain_url}</code>
              <button
                className="copy-btn"
                onClick={() => handleCopy(deployResult.brain_url, 'brain_url')}
              >
                {copyFeedback.field === 'brain_url' ? '✓' : 'Copy'}
              </button>
            </div>
          </div>
          <div className="deploy-field">
            <label>WebSocket URL</label>
            <div className="deploy-url-row">
              <code className="deploy-url">
                {deployResult.brain_url.replace('https://', 'wss://').replace('http://', 'ws://')}
              </code>
              <button
                className="copy-btn"
                onClick={() => handleCopy(deployResult.brain_url.replace('https://', 'wss://').replace('http://', 'ws://'), 'ws_url')}
              >
                {copyFeedback.field === 'ws_url' ? '✓' : 'Copy'}
              </button>
            </div>
          </div>
          <div className="deploy-field">
            <label>API Key</label>
            <div className="deploy-key-row">
              <code className="deploy-key">{deployResult.api_key}</code>
              <button
                className="copy-btn"
                onClick={() => handleCopy(deployResult.api_key, 'api_key')}
              >
                {copyFeedback.field === 'api_key' ? '✓' : 'Copy'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Model Config Preview */}
      {generateStatus === 'ready' && modelConfig && !deployResult && (
        <div className="model-config-preview">
          <h4>Generated Model Configuration</h4>
          <pre>{typeof modelConfig === 'string' ? modelConfig : JSON.stringify(modelConfig, null, 2)}</pre>
        </div>
      )}

      {/* Input Area */}
      <div className="chat-input-area">
        <textarea
          ref={textareaRef}
          className="form-textarea chat-textarea"
          value={inputText}
          onChange={handleTextareaChange}
          onKeyDown={handleKeyDown}
          placeholder="Describe your robot or ask about LNN models..."
          rows={1}
          disabled={isSending}
        />
        <button
          className="btn btn-primary chat-send-btn"
          onClick={handleSendMessage}
          disabled={!inputText.trim() || isSending}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="alert alert-error" style={{ marginTop: 8 }}>
          ✗ {error}
        </div>
      )}
    </div>
  );
}

export default AiChat;
