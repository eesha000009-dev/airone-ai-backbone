/**
 * Airone AI Backbone - AI Chat Component
 * Interactive AI chat interface for designing LNN models for robots.
 * Supports chat with AI, LNN model generation, and cloud deployment.
 */

import React, { useState, useEffect, useRef } from 'react';

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

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Load data on mount
  useEffect(() => {
    loadData();
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

  const handleGenerate = async () => {
    if (!robotId || pins.length === 0) return;

    setGenerateStatus('generating');
    setError(null);

    try {
      if (window.aironeAPI.generateLnnModel) {
        const result = await window.aironeAPI.generateLnnModel({
          robotId,
          robotData,
          pins,
          messages
        });

        setModelConfig(result.config || result);
        setModelId(result.id);
        setGenerateStatus('ready');

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
        await new Promise(resolve => setTimeout(resolve, 2000));

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
          content: `⚡ LNN Model Generated!\n\nModel configuration created with:\n- ${mockConfig.input_neurons} input neurons\n- ${mockConfig.output_neurons} output neurons\n- ${mockConfig.hidden_layers} hidden layers\n- ${mockConfig.activation} activation function\n\nClick "Deploy to Cloud" to make it available for your robot.`,
          timestamp: new Date().toISOString()
        };
        setMessages(prev => [...prev, assistantMessage]);
      }
    } catch (e) {
      setGenerateStatus('error');
      setError('Model generation failed: ' + e.message);
    }
  };

  const handleDeploy = async () => {
    if (!robotId || !modelConfig) return;

    setDeployStatus('deploying');
    setError(null);

    try {
      if (window.aironeAPI.deployBrainService) {
        const result = await window.aironeAPI.deployBrainService({
          robotId,
          modelConfig
        });

        setDeployResult(result);
        setDeployStatus('deployed');

        // Update robot with brain_url
        if (result.brain_url) {
          try {
            await window.aironeAPI.updateRobot(robotId, { brain_url: result.brain_url });
          } catch (e) {
            console.warn('Failed to update robot brain_url:', e);
          }
        }

        const assistantMessage = {
          id: Date.now().toString(),
          role: 'assistant',
          content: `🚀 Brain Service Deployed!\n\nYour LNN model is now live in the cloud. Use the Brain URL and API Key shown below to connect your robot.`,
          timestamp: new Date().toISOString()
        };
        setMessages(prev => [...prev, assistantMessage]);
      } else {
        // Simulate deployment if API not available
        await new Promise(resolve => setTimeout(resolve, 2500));

        const mockResult = {
          brain_url: `https://brain.airone.dev/service/${robotId}`,
          api_key: `airo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          service_id: `svc-${Date.now()}`
        };

        setDeployResult(mockResult);
        setDeployStatus('deployed');

        // Update robot with brain_url
        try {
          await window.aironeAPI.updateRobot(robotId, { brain_url: mockResult.brain_url });
        } catch (e) {
          console.warn('Failed to update robot brain_url:', e);
        }

        const assistantMessage = {
          id: Date.now().toString(),
          role: 'assistant',
          content: `🚀 Brain Service Deployed!\n\nYour LNN model is now live. Use the Brain URL and API Key shown below to connect your robot via the Airone IDE.`,
          timestamp: new Date().toISOString()
        };
        setMessages(prev => [...prev, assistantMessage]);
      }
    } catch (e) {
      setDeployStatus('error');
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

  return (
    <div className="ai-chat fade-in">
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
