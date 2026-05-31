/**
 * Airone AI Backbone - NVIDIA/Kimi API Client
 * Encapsulates all communication with the NVIDIA API (Kimi K2.6 model).
 * Provides chat completion and LNN model generation capabilities.
 * Falls back to z-ai-web-dev-sdk if NVIDIA API is unreachable.
 */

const axios = require('axios');

const NVIDIA_API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const NVIDIA_API_KEY = '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';
const DEFAULT_MODEL = 'moonshotai/kimi-k2.6';

// z-ai SDK for fallback
let zaiInstance = null;
async function getZaiInstance() {
  if (!zaiInstance) {
    try {
      const ZAI = require('z-ai-web-dev-sdk').default;
      zaiInstance = await ZAI.create();
    } catch (e) {
      console.warn('[NvidiaClient] z-ai-web-dev-sdk not available for fallback:', e.message);
    }
  }
  return zaiInstance;
}

const CHAT_SYSTEM_PROMPT = `You are an AI assistant specialized in designing robots with Liquid Neural Networks (LNNs). You help users describe their robot, choose hardware, and prepare for LNN model generation. You have access to the robot's pin definitions and identity. Help the user refine their robot description and pin configuration. When the user is ready, tell them to click the Generate button to create an LNN model.`;

/**
 * Send chat messages to the NVIDIA API and get a completion.
 * @param {Object} params
 * @param {Array} params.messages - Array of { role, content } message objects
 * @param {string} [params.model] - Model to use (defaults to Kimi K2.6)
 * @returns {Promise<string>} The assistant's text content response
 */
async function sendChatCompletion({ messages, model }) {
  const modelToUse = model || DEFAULT_MODEL;

  // Try NVIDIA API first
  try {
    const response = await axios.post(NVIDIA_API_URL, {
      model: modelToUse,
      messages: [
        { role: 'system', content: CHAT_SYSTEM_PROMPT },
        ...messages
      ],
      temperature: 0.7,
      max_tokens: 1024
    }, {
      headers: {
        'Authorization': `Bearer ${NVIDIA_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 60000
    });

    const content = response.data?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('No content in API response');
    }
    return content;
  } catch (nvidiaErr) {
    console.warn('[NvidiaClient] NVIDIA API failed, trying z-ai fallback:', nvidiaErr.message);
    
    // Fallback to z-ai-web-dev-sdk
    try {
      const zai = await getZaiInstance();
      if (zai) {
        const result = await zai.functions.invoke('llm_chat', {
          messages: [
            { role: 'system', content: CHAT_SYSTEM_PROMPT },
            ...messages
          ]
        });
        const content = result?.data?.choices?.[0]?.message?.content || result?.data?.content || '';
        if (content) return content;
      }
    } catch (fallbackErr) {
      console.warn('[NvidiaClient] z-ai fallback also failed:', fallbackErr.message);
    }

    // Both failed
    if (nvidiaErr.response) {
      const status = nvidiaErr.response.status;
      const data = nvidiaErr.response.data;
      throw new Error(`NVIDIA API error (${status}): ${JSON.stringify(data)}`);
    }
    throw new Error(`AI service unavailable: ${nvidiaErr.message}`);
  }
}

/**
 * Generate an LNN (Liquid Neural Network) model configuration via the NVIDIA API.
 * Sends a specialized prompt instructing the AI to output a JSON model config.
 *
 * @param {Object} params
 * @param {Object} params.robotData - Robot metadata (name, type, purpose, environment)
 * @param {Array} params.pins - Array of pin definition objects { name, number, mode, description }
 * @param {Array} params.conversationHistory - Array of { role, content } messages from prior chat
 * @returns {Promise<Object>} Parsed LNN model configuration object
 */
async function generateLnnModel({ robotData, pins, conversationHistory }) {
  const inputPins = pins.filter(p => {
    const mode = (p.mode || '').toLowerCase();
    return mode === 'input' || mode === 'in' || mode === 'analog';
  });
  const outputPins = pins.filter(p => {
    const mode = (p.mode || '').toLowerCase();
    return mode === 'output' || mode === 'out' || mode === 'pwm';
  });

  const inputCount = inputPins.length;
  const outputCount = outputPins.length;

  const inputPinNames = inputPins.map(p => p.name || p.pin_name);
  const outputPinNames = outputPins.map(p => p.name || p.pin_name);

  const inputMapping = {};
  inputPinNames.forEach((name, idx) => {
    inputMapping[name] = idx;
  });

  const outputMapping = {};
  outputPinNames.forEach((name, idx) => {
    outputMapping[name] = idx;
  });

  const LNN_SYSTEM_PROMPT = `You are an AI specialized in designing Liquid Neural Network (LNN) models for robots. You must output ONLY valid JSON with no additional text, explanation, or markdown formatting. The JSON must have exactly this structure:
{
  "input_size": <number of input pins>,
  "output_size": <number of output pins>,
  "hidden_units": 16,
  "time_steps": 1,
  "neuron_params": { "vt": 0.1, "dt": 0.01, "sensitivity": 0.5 },
  "input_mapping": { "pin_name": index },
  "output_mapping": { "pin_name": index },
  "description": "Brief description of the model behavior"
}

Rules:
- input_size MUST equal the number of input pins
- output_size MUST equal the number of output pins
- input_mapping must reference the actual input pin names with their indices (0-based)
- output_mapping must reference the actual output pin names with their indices (0-based)
- neuron_params should be tuned based on the robot's purpose and environment
- description should describe what the LNN model will do
- Output ONLY the JSON object, nothing else`;

  const userMessage = `Generate an LNN model for this robot:

Robot: ${robotData.name || 'Unnamed'} (${robotData.type || 'Custom'})
Purpose: ${robotData.purpose || 'General'}
Environment: ${robotData.environment || 'Indoor'}

Input pins (${inputCount}): ${inputPinNames.join(', ') || 'None'}
Output pins (${outputCount}): ${outputPinNames.join(', ') || 'None'}

Pin details:
${pins.map(p => `  - ${p.name || p.pin_name} (pin ${p.number || p.pin_number}, ${p.mode}): ${p.description || 'No description'}`).join('\n')}

${conversationHistory && conversationHistory.length > 0 ? 'Conversation context:\n' + conversationHistory.map(m => `${m.role}: ${m.content}`).join('\n') : ''}

Generate the LNN model JSON now.`;

  let content = null;

  // Try NVIDIA API first
  try {
    const response = await axios.post(NVIDIA_API_URL, {
      model: DEFAULT_MODEL,
      messages: [
        { role: 'system', content: LNN_SYSTEM_PROMPT },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.3,
      max_tokens: 1024
    }, {
      headers: {
        'Authorization': `Bearer ${NVIDIA_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 60000
    });

    content = response.data?.choices?.[0]?.message?.content;
  } catch (nvidiaErr) {
    console.warn('[NvidiaClient] NVIDIA API failed for LNN generation, trying z-ai fallback:', nvidiaErr.message);
    
    // Fallback to z-ai-web-dev-sdk
    try {
      const zai = await getZaiInstance();
      if (zai) {
        const result = await zai.functions.invoke('llm_chat', {
          messages: [
            { role: 'system', content: LNN_SYSTEM_PROMPT },
            { role: 'user', content: userMessage }
          ]
        });
        content = result?.data?.choices?.[0]?.message?.content || result?.data?.content || null;
      }
    } catch (fallbackErr) {
      console.warn('[NvidiaClient] z-ai fallback also failed for LNN generation:', fallbackErr.message);
    }
  }

  if (content) {

    // Try to parse as JSON directly
    try {
      return JSON.parse(content);
    } catch (_parseErr) {
      // Not valid JSON — try extracting JSON via regex
    }

    // Try to extract JSON block from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (_err) {
        // Still couldn't parse
      }
    }

    // If all parsing fails, build a default config from the pin data
    console.warn('[NvidiaClient] Could not parse LNN JSON from API response, generating default config');
  }

  // Build default config from pin data (used when API is unavailable or response is unparseable)
  console.log('[NvidiaClient] Generating default LNN config from pin definitions');
  return {
    input_size: inputCount,
    output_size: outputCount,
    hidden_units: 16,
    time_steps: 1,
    neuron_params: { vt: 0.1, dt: 0.01, sensitivity: 0.5 },
    input_mapping: inputMapping,
    output_mapping: outputMapping,
    description: `LNN model for ${robotData.name || 'robot'} with ${inputCount} inputs and ${outputCount} outputs`
  };
}

module.exports = {
  sendChatCompletion,
  generateLnnModel
};
