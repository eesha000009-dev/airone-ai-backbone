/**
 * Airone AI Backbone - NVIDIA/Kimi API Client
 * Encapsulates all communication with the NVIDIA API (Kimi K2.6 model).
 * Provides chat completion, LNN model generation, training data generation,
 * LNN training, and model verification capabilities.
 *
 * Training Pipeline:
 * 1. Generate LNN architecture via Kimi K2.6
 * 2. Generate synthetic training data (sensor inputs + expected outputs)
 * 3. Train LNN weights using gradient descent on the training data
 * 4. Verify model correctness with test scenarios
 */

const axios = require('axios');

const NVIDIA_API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const NVIDIA_API_KEY = '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';
const DEFAULT_MODEL = 'moonshotai/kimi-k2.6';
const FALLBACK_MODEL = 'meta/llama-3.1-8b-instruct';

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

const CHAT_SYSTEM_PROMPT = `You are an AI assistant specialized in designing robots with Liquid Neural Networks (LNNs). You help users describe their robot, choose hardware, and prepare for LNN model generation. When the user is ready, tell them to click the Generate button to create and train an LNN model.`;

/**
 * Send chat messages to the NVIDIA API and get a completion.
 */
async function sendChatCompletion({ messages, model }) {
  const modelToUse = model || DEFAULT_MODEL;

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
      timeout: 120000
    });

    const content = response.data?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('No content in API response');
    }
    return content;
  } catch (nvidiaErr) {
    console.warn('[NvidiaClient] NVIDIA API failed, trying z-ai fallback:', nvidiaErr.message);

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

    if (nvidiaErr.response) {
      const status = nvidiaErr.response.status;
      const data = nvidiaErr.response.data;
      throw new Error(`NVIDIA API error (${status}): ${JSON.stringify(data)}`);
    }
    throw new Error(`AI service unavailable: ${nvidiaErr.message}`);
  }
}

/**
 * Call NVIDIA API with streaming and return the full response.
 * Uses streaming to avoid timeout on slow models like Kimi K2.6.
 */
async function callNvidiaStreaming(messages, options = {}) {
  const modelToUse = options.model || DEFAULT_MODEL;
  const temperature = options.temperature || 0.3;
  const maxTokens = options.maxTokens || 4096;

  try {
    const response = await axios.post(NVIDIA_API_URL, {
      model: modelToUse,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: true
    }, {
      headers: {
        'Authorization': `Bearer ${NVIDIA_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 180000, // 3 minutes for streaming
      responseType: 'stream'
    });

    return new Promise((resolve, reject) => {
      let fullContent = '';
      let chunkCount = 0;

      response.data.on('data', (chunk) => {
        const text = chunk.toString();
        const lines = text.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim();
            if (dataStr === '[DONE]') continue;
            try {
              const parsed = JSON.parse(dataStr);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                fullContent += delta;
                chunkCount++;
              }
            } catch (_e) {
              // Ignore parse errors for incomplete chunks
            }
          }
        }
      });

      response.data.on('end', () => {
        console.log(`[NvidiaClient] Streaming complete: ${chunkCount} chunks, ${fullContent.length} chars`);
        resolve(fullContent);
      });

      response.data.on('error', (err) => {
        reject(new Error(`Streaming error: ${err.message}`));
      });
    });
  } catch (err) {
    console.warn('[NvidiaClient] Streaming failed, falling back to non-streaming:', err.message);
    // Fallback to non-streaming
    const response = await axios.post(NVIDIA_API_URL, {
      model: modelToUse,
      messages,
      temperature,
      max_tokens: maxTokens
    }, {
      headers: {
        'Authorization': `Bearer ${NVIDIA_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 180000
    });
    return response.data?.choices?.[0]?.message?.content || '';
  }
}

/**
 * Generate an LNN model configuration via the NVIDIA API.
 * Step 1: Generate architecture
 */
async function generateLnnArchitecture({ robotData, pins, conversationHistory }) {
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

  const inputMapping = {};
  inputPins.forEach((p, idx) => {
    inputMapping[p.name || p.pin_name] = idx;
  });

  const outputMapping = {};
  outputPins.forEach((p, idx) => {
    outputMapping[p.name || p.pin_name] = idx;
  });

  // Determine output types based on pin modes
  const outputTypes = {};
  outputPins.forEach((p) => {
    const name = p.name || p.pin_name;
    const mode = (p.mode || '').toLowerCase();
    const desc = (p.description || '').toLowerCase();
    if (mode === 'pwm' || desc.includes('motor') || desc.includes('speed')) {
      outputTypes[name] = 'pwm';
    } else if (desc.includes('servo') || desc.includes('angle') || desc.includes('arm') || desc.includes('hand') || desc.includes('leg')) {
      outputTypes[name] = 'servo';
    } else {
      outputTypes[name] = 'digital';
    }
  });

  const LNN_SYSTEM_PROMPT = `You are an AI specialized in designing Liquid Neural Network (LNN) models for robots. You must output ONLY valid JSON with no additional text, explanation, or markdown formatting.

The JSON must have exactly this structure:
{
  "input_size": <number>,
  "output_size": <number>,
  "hidden_units": <16-32 based on complexity>,
  "time_steps": 1,
  "neuron_params": { "tau": <0.05-0.5 based on response speed needed>, "dt": 0.01, "sensitivity": 0.5 },
  "input_mapping": { "pin_name": index },
  "output_mapping": { "pin_name": index },
  "output_types": { "pin_name": "pwm"|"servo"|"digital" },
  "behavior_rules": [
    { "condition": "when sensor X is Y", "action": "set output Z to W", "priority": 1 }
  ],
  "description": "Brief description of model behavior"
}

Rules:
- input_size MUST equal the number of input pins
- output_size MUST equal the number of output pins
- hidden_units: 16 for simple robots, 24 for medium, 32 for complex
- tau: lower = faster response (0.05 for reflexes, 0.5 for smooth movements)
- output_types: "pwm" for motors, "servo" for servos/arms, "digital" for LEDs/relays
- behavior_rules: describe the robot's expected behaviors as condition-action pairs
- Output ONLY the JSON object, nothing else`;

  const userMessage = `Generate an LNN model for this robot:

Robot: ${robotData.name || 'Unnamed'} (${robotData.type || 'Custom'})
Purpose: ${robotData.purpose || 'General'}
Environment: ${robotData.environment || 'Indoor'}

Input pins (${inputCount}): ${inputPins.map(p => p.name || p.pin_name).join(', ') || 'None'}
Output pins (${outputCount}): ${outputPins.map(p => p.name || p.pin_name).join(', ') || 'None'}

Pin details:
${pins.map(p => `  - ${p.name || p.pin_name} (pin ${p.number || p.pin_number}, ${p.mode}): ${p.description || 'No description'}`).join('\n')}

${conversationHistory && conversationHistory.length > 0 ? 'Conversation context:\n' + conversationHistory.map(m => `${m.role}: ${m.content}`).join('\n') : ''}

Generate the LNN model JSON now.`;

  let content = null;

  // Try NVIDIA API with streaming for better performance
  try {
    console.log('[NvidiaClient] Generating LNN architecture with Kimi K2.6 (streaming)...');
    content = await callNvidiaStreaming([
      { role: 'system', content: LNN_SYSTEM_PROMPT },
      { role: 'user', content: userMessage }
    ], { temperature: 0.3, maxTokens: 2048 });
  } catch (nvidiaErr) {
    console.warn('[NvidiaClient] Kimi K2.6 failed for LNN generation:', nvidiaErr.message);

    // Try with the faster fallback model
    try {
      console.log('[NvidiaClient] Trying fallback model (Llama 3.1)...');
      const fallbackResponse = await axios.post(NVIDIA_API_URL, {
        model: FALLBACK_MODEL,
        messages: [
          { role: 'system', content: LNN_SYSTEM_PROMPT },
          { role: 'user', content: userMessage }
        ],
        temperature: 0.3,
        max_tokens: 2048
      }, {
        headers: {
          'Authorization': `Bearer ${NVIDIA_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000
      });
      content = fallbackResponse.data?.choices?.[0]?.message?.content;
      console.log('[NvidiaClient] Successfully used fallback model for LNN generation');
    } catch (fallbackModelErr) {
      console.warn('[NvidiaClient] Fallback model also failed:', fallbackModelErr.message);
    }

    // Fallback to z-ai-web-dev-sdk
    if (!content) {
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
  }

  let modelConfig = null;

  if (content) {
    // Try to parse as JSON directly
    try {
      modelConfig = JSON.parse(content);
    } catch (_parseErr) {
      // Not valid JSON — try extracting JSON via regex
    }

    if (!modelConfig) {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          modelConfig = JSON.parse(jsonMatch[0]);
        } catch (_err) {
          // Still couldn't parse
        }
      }
    }
  }

  // Build default config if AI failed
  if (!modelConfig) {
    console.log('[NvidiaClient] Generating default LNN config from pin definitions');
    modelConfig = {
      input_size: inputCount,
      output_size: outputCount,
      hidden_units: 16,
      time_steps: 1,
      neuron_params: { tau: 0.1, dt: 0.01, sensitivity: 0.5 },
      input_mapping: inputMapping,
      output_mapping: outputMapping,
      output_types: outputTypes,
      behavior_rules: [],
      description: `LNN model for ${robotData.name || 'robot'} with ${inputCount} inputs and ${outputCount} outputs`
    };
  }

  // Ensure required fields
  modelConfig.input_mapping = modelConfig.input_mapping || inputMapping;
  modelConfig.output_mapping = modelConfig.output_mapping || outputMapping;
  modelConfig.output_types = modelConfig.output_types || outputTypes;
  if (!modelConfig.behavior_rules) modelConfig.behavior_rules = [];

  return modelConfig;
}

/**
 * Step 2: Generate synthetic training data using AI.
 * The AI generates realistic sensor input scenarios and expected output commands.
 */
async function generateTrainingData({ robotData, pins, modelConfig, conversationHistory }) {
  const inputPins = pins.filter(p => {
    const mode = (p.mode || '').toLowerCase();
    return mode === 'input' || mode === 'in' || mode === 'analog';
  });
  const outputPins = pins.filter(p => {
    const mode = (p.mode || '').toLowerCase();
    return mode === 'output' || mode === 'out' || mode === 'pwm';
  });

  const inputNames = inputPins.map(p => p.name || p.pin_name);
  const outputNames = outputPins.map(p => p.name || p.pin_name);

  const behaviorRules = modelConfig.behavior_rules || [];
  const rulesText = behaviorRules.length > 0
    ? behaviorRules.map((r, i) => `${i + 1}. IF ${r.condition} THEN ${r.action} (priority: ${r.priority || 1})`).join('\n')
    : 'Use reasonable robot behaviors based on the robot description.';

  const TRAINING_DATA_PROMPT = `You are generating SYNTHETIC TRAINING DATA for a Liquid Neural Network that controls a robot. Output ONLY valid JSON, no markdown, no explanation.

Robot: ${robotData.name || 'Unnamed'} (${robotData.type || 'Custom'})
Purpose: ${robotData.purpose || 'General'}
Environment: ${robotData.environment || 'Indoor'}

Input sensors (${inputNames.length}): ${inputNames.join(', ')}
Output actuators (${outputNames.length}): ${outputNames.join(', ')}

Output types: ${JSON.stringify(modelConfig.output_types || {})}

Behavior rules:
${rulesText}

Generate EXACTLY this JSON structure with 30 training examples:
{
  "training_data": [
    {
      "inputs": { "sensor_name": normalized_value_0_to_1, ... },
      "expected_outputs": { "actuator_name": normalized_value_0_to_1, ... }
    }
  ]
}

NORMALIZATION RULES:
- Ultrasonic/distance sensors: raw_cm / 400 (max range ~400cm)
- Temperature sensors: (raw_celsius - (-20)) / 80 (range -20 to 60°C)
- Light sensors: raw_value / 1023 (0-1023 range)
- Microphone/sound: 0 for silence, 0.5 for moderate, 1.0 for loud
- Camera/object detection: 0 for nothing, 0.5 for object far, 1.0 for object close
- PIR/motion: 0 for no motion, 1 for motion detected
- Generic analog: raw / 1023

OUTPUT NORMALIZATION:
- PWM/motor outputs: 0 to 1 (maps to 0-255 PWM)
- Servo outputs: 0 to 1 (maps to 0-180 degrees)
- Digital/LED outputs: 0 or 1

Generate diverse scenarios including:
- Normal operating conditions
- Edge cases (very close/far, very hot/cold)
- Emergency scenarios (obstacle very close, overheating)
- Idle/rest states
- Transition scenarios

Output ONLY the JSON object.`;

  let content = null;

  try {
    console.log('[NvidiaClient] Generating training data with Kimi K2.6 (streaming)...');
    content = await callNvidiaStreaming([
      { role: 'system', content: TRAINING_DATA_PROMPT },
      { role: 'user', content: 'Generate the training data now.' }
    ], { temperature: 0.5, maxTokens: 4096 });
  } catch (err) {
    console.warn('[NvidiaClient] Training data generation failed with Kimi:', err.message);

    // Try fallback model
    try {
      console.log('[NvidiaClient] Trying fallback model for training data...');
      const response = await axios.post(NVIDIA_API_URL, {
        model: FALLBACK_MODEL,
        messages: [
          { role: 'system', content: TRAINING_DATA_PROMPT },
          { role: 'user', content: 'Generate the training data now.' }
        ],
        temperature: 0.5,
        max_tokens: 4096
      }, {
        headers: {
          'Authorization': `Bearer ${NVIDIA_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000
      });
      content = response.data?.choices?.[0]?.message?.content;
    } catch (fallbackErr) {
      console.warn('[NvidiaClient] Fallback training data generation also failed:', fallbackErr.message);
    }
  }

  let trainingData = null;

  if (content) {
    try {
      trainingData = JSON.parse(content);
    } catch (_e) {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          trainingData = JSON.parse(jsonMatch[0]);
        } catch (_e2) {
          // Couldn't parse
        }
      }
    }
  }

  // If AI failed, generate training data from behavior rules
  if (!trainingData || !trainingData.training_data || trainingData.training_data.length === 0) {
    console.log('[NvidiaClient] AI training data generation failed, generating from behavior rules');
    trainingData = generateTrainingDataFromRules(modelConfig, inputPins, outputPins, robotData);
  }

  return trainingData.training_data;
}

/**
 * Generate training data from behavior rules (fallback when AI is unavailable).
 * Generates 50+ diverse scenarios with strong output signals (near 0 or 1).
 * Includes specialized obstacle avoidance logic for side-specific motor control.
 */
function generateTrainingDataFromRules(modelConfig, inputPins, outputPins, robotData) {
  const inputNames = inputPins.map(p => p.name || p.pin_name);
  const outputNames = outputPins.map(p => p.name || p.pin_name);
  const outputTypes = modelConfig.output_types || {};
  const rules = modelConfig.behavior_rules || [];

  const trainingData = [];

  // Categorize input and output pins by side/direction
  const leftDistNames = inputNames.filter(n => {
    const d = n.toLowerCase();
    return (d.includes('ultrasonic') || d.includes('distance')) && (d.includes('left'));
  });
  const rightDistNames = inputNames.filter(n => {
    const d = n.toLowerCase();
    return (d.includes('ultrasonic') || d.includes('distance')) && (d.includes('right'));
  });
  const frontDistNames = inputNames.filter(n => {
    const d = n.toLowerCase();
    return (d.includes('ultrasonic') || d.includes('distance')) && (d.includes('front') || d.includes('center'));
  });
  const allDistNames = inputNames.filter(n => {
    const d = n.toLowerCase();
    return d.includes('ultrasonic') || d.includes('distance');
  });

  const leftMotorNames = outputNames.filter(n => {
    const d = n.toLowerCase();
    return (d.includes('motor') || outputTypes[n] === 'pwm') && (d.includes('left'));
  });
  const rightMotorNames = outputNames.filter(n => {
    const d = n.toLowerCase();
    return (d.includes('motor') || outputTypes[n] === 'pwm') && (d.includes('right'));
  });
  const allMotorNames = outputNames.filter(n => {
    const d = n.toLowerCase();
    return d.includes('motor') || outputTypes[n] === 'pwm';
  });
  const servoNames = outputNames.filter(n => {
    const d = n.toLowerCase();
    return d.includes('servo') || d.includes('arm') || d.includes('hand') || d.includes('leg') || outputTypes[n] === 'servo';
  });
  const digitalNames = outputNames.filter(n => {
    const d = n.toLowerCase();
    return !allMotorNames.includes(n) && !servoNames.includes(n);
  });

  // Helper: generate a random value in a range
  const randRange = (min, max) => min + Math.random() * (max - min);

  // Scenario 1: Obstacle close on left -> stop left motor, full right motor, turn right (8 scenarios)
  for (let i = 0; i < 8; i++) {
    const inputs = {};
    const expectedOutputs = {};
    inputNames.forEach(name => {
      const d = name.toLowerCase();
      if (leftDistNames.includes(name)) {
        inputs[name] = randRange(0.02, 0.12); // Very close on left
      } else if (rightDistNames.includes(name)) {
        inputs[name] = randRange(0.5, 1.0); // Clear on right
      } else if (frontDistNames.includes(name)) {
        inputs[name] = randRange(0.2, 0.5); // Medium front
      } else if (d.includes('ultrasonic') || d.includes('distance')) {
        inputs[name] = randRange(0.4, 0.8);
      } else {
        inputs[name] = generateDefaultSensorValue(name);
      }
    });
    outputNames.forEach(name => {
      if (leftMotorNames.includes(name)) {
        expectedOutputs[name] = 0.0; // Stop left motor
      } else if (rightMotorNames.includes(name)) {
        expectedOutputs[name] = 0.8 + Math.random() * 0.2; // Full right motor
      } else if (allMotorNames.includes(name)) {
        expectedOutputs[name] = 0.9; // Full speed away
      } else if (servoNames.includes(name)) {
        expectedOutputs[name] = 0.8; // Turn away right
      } else {
        expectedOutputs[name] = 0.0; // Off
      }
    });
    trainingData.push({ inputs, expected_outputs: expectedOutputs });
  }

  // Scenario 2: Obstacle close on right -> stop right motor, full left motor, turn left (8 scenarios)
  for (let i = 0; i < 8; i++) {
    const inputs = {};
    const expectedOutputs = {};
    inputNames.forEach(name => {
      const d = name.toLowerCase();
      if (rightDistNames.includes(name)) {
        inputs[name] = randRange(0.02, 0.12); // Very close on right
      } else if (leftDistNames.includes(name)) {
        inputs[name] = randRange(0.5, 1.0); // Clear on left
      } else if (frontDistNames.includes(name)) {
        inputs[name] = randRange(0.2, 0.5); // Medium front
      } else if (d.includes('ultrasonic') || d.includes('distance')) {
        inputs[name] = randRange(0.4, 0.8);
      } else {
        inputs[name] = generateDefaultSensorValue(name);
      }
    });
    outputNames.forEach(name => {
      if (rightMotorNames.includes(name)) {
        expectedOutputs[name] = 0.0; // Stop right motor
      } else if (leftMotorNames.includes(name)) {
        expectedOutputs[name] = 0.8 + Math.random() * 0.2; // Full left motor
      } else if (allMotorNames.includes(name)) {
        expectedOutputs[name] = 0.9; // Full speed away
      } else if (servoNames.includes(name)) {
        expectedOutputs[name] = 0.2; // Turn away left
      } else {
        expectedOutputs[name] = 0.0; // Off
      }
    });
    trainingData.push({ inputs, expected_outputs: expectedOutputs });
  }

  // Scenario 3: Obstacle very close in front -> both motors stop, reverse (6 scenarios)
  for (let i = 0; i < 6; i++) {
    const inputs = {};
    const expectedOutputs = {};
    inputNames.forEach(name => {
      const d = name.toLowerCase();
      if (frontDistNames.includes(name)) {
        inputs[name] = randRange(0.02, 0.1); // Very close in front
      } else if (d.includes('ultrasonic') || d.includes('distance')) {
        inputs[name] = randRange(0.05, 0.15); // Also close
      } else {
        inputs[name] = generateDefaultSensorValue(name);
      }
    });
    outputNames.forEach(name => {
      if (allMotorNames.includes(name)) {
        expectedOutputs[name] = 0.0; // Stop all motors
      } else if (servoNames.includes(name)) {
        expectedOutputs[name] = 0.5 + (Math.random() > 0.5 ? 0.3 : -0.3); // Turn sharply
      } else {
        expectedOutputs[name] = 1.0; // Warning on
      }
    });
    trainingData.push({ inputs, expected_outputs: expectedOutputs });
  }

  // Scenario 4: Clear path -> full speed forward (8 scenarios)
  for (let i = 0; i < 8; i++) {
    const inputs = {};
    const expectedOutputs = {};
    inputNames.forEach(name => {
      const d = name.toLowerCase();
      if (d.includes('ultrasonic') || d.includes('distance')) {
        inputs[name] = randRange(0.6, 1.0); // Far / clear
      } else {
        inputs[name] = generateDefaultSensorValue(name);
      }
    });
    outputNames.forEach(name => {
      if (allMotorNames.includes(name)) {
        expectedOutputs[name] = 0.7 + Math.random() * 0.3; // Full speed
      } else if (servoNames.includes(name)) {
        expectedOutputs[name] = 0.5; // Center
      } else {
        expectedOutputs[name] = 0.0; // Off
      }
    });
    trainingData.push({ inputs, expected_outputs: expectedOutputs });
  }

  // Scenario 5: Medium distance -> slow approach (6 scenarios)
  for (let i = 0; i < 6; i++) {
    const inputs = {};
    const expectedOutputs = {};
    inputNames.forEach(name => {
      const d = name.toLowerCase();
      if (d.includes('ultrasonic') || d.includes('distance')) {
        inputs[name] = randRange(0.25, 0.45); // Medium distance
      } else {
        inputs[name] = generateDefaultSensorValue(name);
      }
    });
    outputNames.forEach(name => {
      if (allMotorNames.includes(name)) {
        expectedOutputs[name] = 0.3 + Math.random() * 0.15; // Slow
      } else if (servoNames.includes(name)) {
        expectedOutputs[name] = 0.5; // Center
      } else {
        expectedOutputs[name] = 0.0;
      }
    });
    trainingData.push({ inputs, expected_outputs: expectedOutputs });
  }

  // Scenario 6: Edge cases - very close on both sides (4 scenarios)
  for (let i = 0; i < 4; i++) {
    const inputs = {};
    const expectedOutputs = {};
    inputNames.forEach(name => {
      const d = name.toLowerCase();
      if (d.includes('ultrasonic') || d.includes('distance')) {
        inputs[name] = randRange(0.02, 0.1); // Very close everywhere
      } else {
        inputs[name] = generateDefaultSensorValue(name);
      }
    });
    outputNames.forEach(name => {
      if (allMotorNames.includes(name)) {
        expectedOutputs[name] = 0.0; // Full stop - trapped
      } else if (servoNames.includes(name)) {
        expectedOutputs[name] = 0.5; // Center - no good direction
      } else {
        expectedOutputs[name] = 1.0; // Warning
      }
    });
    trainingData.push({ inputs, expected_outputs: expectedOutputs });
  }

  // Scenario 7: High temperature -> slow down + warning (4 scenarios)
  for (let i = 0; i < 4; i++) {
    const inputs = {};
    const expectedOutputs = {};
    inputNames.forEach(name => {
      const d = name.toLowerCase();
      if (d.includes('temp')) {
        inputs[name] = randRange(0.75, 1.0); // Hot
      } else if (d.includes('ultrasonic') || d.includes('distance')) {
        inputs[name] = randRange(0.5, 1.0);
      } else {
        inputs[name] = generateDefaultSensorValue(name);
      }
    });
    outputNames.forEach(name => {
      if (allMotorNames.includes(name)) {
        expectedOutputs[name] = 0.15 + Math.random() * 0.1; // Minimal speed
      } else if (digitalNames.includes(name)) {
        expectedOutputs[name] = 1.0; // Warning LED
      } else {
        expectedOutputs[name] = 0.0;
      }
    });
    trainingData.push({ inputs, expected_outputs: expectedOutputs });
  }

  // Scenario 8: Motion detected -> alert (4 scenarios)
  for (let i = 0; i < 4; i++) {
    const inputs = {};
    const expectedOutputs = {};
    inputNames.forEach(name => {
      const d = name.toLowerCase();
      if (d.includes('pir') || d.includes('motion')) {
        inputs[name] = 1.0; // Motion detected
      } else if (d.includes('ultrasonic') || d.includes('distance')) {
        inputs[name] = randRange(0.4, 0.8);
      } else {
        inputs[name] = generateDefaultSensorValue(name);
      }
    });
    outputNames.forEach(name => {
      if (allMotorNames.includes(name)) {
        expectedOutputs[name] = 0.4 + Math.random() * 0.2; // Approach slowly
      } else if (digitalNames.includes(name)) {
        expectedOutputs[name] = 1.0; // Alert on
      } else if (servoNames.includes(name)) {
        expectedOutputs[name] = 0.5; // Center
      } else {
        expectedOutputs[name] = 0.0;
      }
    });
    trainingData.push({ inputs, expected_outputs: expectedOutputs });
  }

  // Scenario 9: Dark environment (low light) -> turn on lights (4 scenarios)
  for (let i = 0; i < 4; i++) {
    const inputs = {};
    const expectedOutputs = {};
    inputNames.forEach(name => {
      const d = name.toLowerCase();
      if (d.includes('light') || d.includes('ldr')) {
        inputs[name] = randRange(0.0, 0.15); // Dark
      } else if (d.includes('ultrasonic') || d.includes('distance')) {
        inputs[name] = randRange(0.5, 1.0); // Clear
      } else {
        inputs[name] = generateDefaultSensorValue(name);
      }
    });
    outputNames.forEach(name => {
      if (digitalNames.includes(name)) {
        const nd = name.toLowerCase();
        if (nd.includes('led') || nd.includes('light') || nd.includes('lamp')) {
          expectedOutputs[name] = 1.0; // Turn on light
        } else {
          expectedOutputs[name] = 0.0;
        }
      } else if (allMotorNames.includes(name)) {
        expectedOutputs[name] = 0.3 + Math.random() * 0.15; // Cautious speed
      } else {
        expectedOutputs[name] = 0.0;
      }
    });
    trainingData.push({ inputs, expected_outputs: expectedOutputs });
  }

  // Scenario 10: Random diverse scenarios to fill out (remaining to reach 55+)
  const remaining = Math.max(5, 55 - trainingData.length);
  for (let i = 0; i < remaining; i++) {
    const inputs = {};
    const expectedOutputs = {};
    inputNames.forEach(name => {
      inputs[name] = generateDefaultSensorValue(name);
    });
    // Compute outputs based on overall sensor state
    const distEntries = Object.entries(inputs).filter(([k]) => {
      const d = k.toLowerCase();
      return d.includes('ultrasonic') || d.includes('distance');
    });
    const minDist = distEntries.length > 0 ? Math.min(...distEntries.map(([, v]) => v)) : 1.0;
    const tempEntries = Object.entries(inputs).filter(([k]) => k.toLowerCase().includes('temp'));
    const maxTemp = tempEntries.length > 0 ? Math.max(...tempEntries.map(([, v]) => v)) : 0.3;
    const motionEntries = Object.entries(inputs).filter(([k]) =>
      k.toLowerCase().includes('pir') || k.toLowerCase().includes('motion'));
    const hasMotion = motionEntries.some(([, v]) => v > 0.5);

    outputNames.forEach(name => {
      const outType = outputTypes[name] || 'digital';
      if (allMotorNames.includes(name) || outType === 'pwm') {
        if (minDist < 0.12) {
          expectedOutputs[name] = 0.0;
        } else if (minDist < 0.25) {
          expectedOutputs[name] = 0.15 + Math.random() * 0.1;
        } else if (minDist < 0.45) {
          expectedOutputs[name] = 0.35 + Math.random() * 0.15;
        } else {
          expectedOutputs[name] = 0.7 + Math.random() * 0.3;
        }
      } else if (servoNames.includes(name) || outType === 'servo') {
        if (minDist < 0.15) {
          expectedOutputs[name] = Math.random() > 0.5 ? 0.85 : 0.15; // Sharp turn
        } else {
          expectedOutputs[name] = 0.4 + Math.random() * 0.2; // Near center
        }
      } else {
        if (maxTemp > 0.75 || minDist < 0.1) {
          expectedOutputs[name] = 1.0;
        } else if (hasMotion) {
          expectedOutputs[name] = 1.0;
        } else {
          expectedOutputs[name] = 0.0;
        }
      }
    });
    trainingData.push({ inputs, expected_outputs: expectedOutputs });
  }

  console.log(`[NvidiaClient] Generated ${trainingData.length} training examples from rules`);
  return { training_data: trainingData };
}

/**
 * Generate a default sensor value based on sensor name.
 * Produces varied but realistic values for training diversity.
 */
function generateDefaultSensorValue(name) {
  const d = (name || '').toLowerCase();
  if (d.includes('ultrasonic') || d.includes('distance')) {
    // Produce values across the full range with bias toward extremes
    const r = Math.random();
    if (r < 0.3) return 0.02 + Math.random() * 0.1;  // Close
    if (r < 0.5) return 0.2 + Math.random() * 0.2;   // Medium
    return 0.6 + Math.random() * 0.4;                  // Far
  } else if (d.includes('temp')) {
    return Math.random();
  } else if (d.includes('light') || d.includes('ldr')) {
    const r = Math.random();
    if (r < 0.3) return 0.05 + Math.random() * 0.15;  // Dark
    if (r < 0.6) return 0.3 + Math.random() * 0.3;    // Medium
    return 0.7 + Math.random() * 0.3;                   // Bright
  } else if (d.includes('pir') || d.includes('motion')) {
    return Math.random() > 0.5 ? 1.0 : 0.0;
  } else if (d.includes('mic') || d.includes('sound')) {
    const r = Math.random();
    if (r < 0.5) return 0.0;        // Silence
    if (r < 0.8) return 0.4 + Math.random() * 0.2;  // Moderate
    return 0.8 + Math.random() * 0.2; // Loud
  } else if (d.includes('camera') || d.includes('object')) {
    const r = Math.random();
    if (r < 0.4) return 0.0;        // Nothing
    if (r < 0.7) return 0.3 + Math.random() * 0.2;  // Far
    return 0.7 + Math.random() * 0.3; // Close
  } else {
    return Math.random();
  }
}

/**
 * Step 3: Train the LNN model using the generated training data.
 * Uses simple gradient descent (backpropagation through time, 1 step).
 * Returns the model config with trained weights.
 */
function trainLnnModel(modelConfig, trainingData, options = {}) {
  const epochs = options.epochs || 300;
  const learningRate = options.learningRate || 0.02;
  const hiddenUnits = modelConfig.hidden_units || 16;
  const inputSize = modelConfig.input_size;
  const outputSize = modelConfig.output_size;

  // Initialize weights
  let W_in = modelConfig.weights?.W_in || xavierInit(hiddenUnits, inputSize);
  let W_rec = modelConfig.weights?.W_rec || xavierInit(hiddenUnits, hiddenUnits);
  let W_out = modelConfig.weights?.W_out || xavierInit(outputSize, hiddenUnits);
  let b_in = modelConfig.weights?.b_in || new Array(hiddenUnits).fill(0);
  let b_out = modelConfig.weights?.b_out || new Array(outputSize).fill(0);

  const inputMapping = modelConfig.input_mapping || {};
  const outputMapping = modelConfig.output_mapping || {};

  // Convert training data to ordered arrays
  const examples = trainingData.map(example => {
    const inputArr = new Array(inputSize).fill(0);
    const outputArr = new Array(outputSize).fill(0);

    if (example.inputs) {
      for (const [name, idx] of Object.entries(inputMapping)) {
        const val = example.inputs[name];
        if (val !== undefined && idx < inputSize) {
          inputArr[idx] = typeof val === 'number' ? val : parseFloat(val) || 0;
        }
      }
    }

    if (example.expected_outputs) {
      for (const [name, idx] of Object.entries(outputMapping)) {
        const val = example.expected_outputs[name];
        if (val !== undefined && idx < outputSize) {
          outputArr[idx] = typeof val === 'number' ? val : parseFloat(val) || 0;
        }
      }
    }

    return { input: inputArr, target: outputArr };
  }).filter(ex => ex.input.some(v => v !== 0) || ex.target.some(v => v !== 0));

  if (examples.length === 0) {
    console.warn('[NvidiaClient] No valid training examples, using random weights');
    modelConfig.weights = { W_in, W_rec, W_out, b_in, b_out };
    return { modelConfig, accuracy: 0, loss: 1, epochs: 0 };
  }

  console.log(`[NvidiaClient] Training LNN: ${examples.length} examples, ${epochs} epochs`);

  // Training loop
  let lastLoss = Infinity;
  let bestWeights = { W_in, W_rec, W_out, b_in, b_out };
  let bestLoss = Infinity;

  for (let epoch = 0; epoch < epochs; epoch++) {
    let totalLoss = 0;
    let correctCount = 0;

    // Shuffle examples each epoch
    const shuffled = [...examples].sort(() => Math.random() - 0.5);

    for (const example of shuffled) {
      // Forward pass
      const hidden = new Array(hiddenUnits).fill(0);
      const preActivation = new Array(hiddenUnits).fill(0);

      for (let i = 0; i < hiddenUnits; i++) {
        let sum = b_in[i];
        for (let j = 0; j < inputSize; j++) {
          sum += W_in[i][j] * example.input[j];
        }
        preActivation[i] = sum;
        hidden[i] = Math.tanh(sum);
      }

      // Output layer
      const output = new Array(outputSize).fill(0);
      for (let i = 0; i < outputSize; i++) {
        let sum = b_out[i];
        for (let j = 0; j < hiddenUnits; j++) {
          sum += W_out[i][j] * hidden[j];
        }
        output[i] = sigmoid(sum);
      }

      // Compute loss (MSE)
      let exampleLoss = 0;
      let exampleCorrect = true;
      for (let i = 0; i < outputSize; i++) {
        const error = output[i] - example.target[i];
        exampleLoss += error * error;
        // Check if output is "correct" (within 0.2 of target)
        if (Math.abs(error) > 0.2) exampleCorrect = false;
      }
      totalLoss += exampleLoss / outputSize;
      if (exampleCorrect) correctCount++;

      // Backward pass (simplified - compute gradients)
      // Output layer gradients
      const outputDelta = new Array(outputSize).fill(0);
      for (let i = 0; i < outputSize; i++) {
        const error = output[i] - example.target[i];
        outputDelta[i] = error * output[i] * (1 - output[i]); // sigmoid derivative
      }

      // Hidden layer gradients
      const hiddenDelta = new Array(hiddenUnits).fill(0);
      for (let i = 0; i < hiddenUnits; i++) {
        let errorSum = 0;
        for (let j = 0; j < outputSize; j++) {
          errorSum += outputDelta[j] * W_out[j][i];
        }
        hiddenDelta[i] = errorSum * (1 - hidden[i] * hidden[i]); // tanh derivative
      }

      // Update output weights
      for (let i = 0; i < outputSize; i++) {
        for (let j = 0; j < hiddenUnits; j++) {
          W_out[i][j] -= learningRate * outputDelta[i] * hidden[j];
        }
        b_out[i] -= learningRate * outputDelta[i];
      }

      // Update input weights
      for (let i = 0; i < hiddenUnits; i++) {
        for (let j = 0; j < inputSize; j++) {
          W_in[i][j] -= learningRate * hiddenDelta[i] * example.input[j];
        }
        b_in[i] -= learningRate * hiddenDelta[i];
      }
    }

    lastLoss = totalLoss / examples.length;
    const accuracy = correctCount / examples.length;

    // Track best weights
    if (lastLoss < bestLoss) {
      bestLoss = lastLoss;
      bestWeights = {
        W_in: W_in.map(row => [...row]),
        W_rec: W_rec.map(row => [...row]),
        W_out: W_out.map(row => [...row]),
        b_in: [...b_in],
        b_out: [...b_out]
      };
    }

    // Log progress every 20 epochs
    if (epoch % 20 === 0 || epoch === epochs - 1) {
      console.log(`[NvidiaClient] Epoch ${epoch + 1}/${epochs}: loss=${lastLoss.toFixed(4)}, accuracy=${(accuracy * 100).toFixed(1)}%`);
    }

    // Early stopping if loss is very low
    if (lastLoss < 0.001) {
      console.log(`[NvidiaClient] Early stopping at epoch ${epoch + 1}: loss=${lastLoss.toFixed(6)}`);
      break;
    }
  }

  // Use best weights
  modelConfig.weights = bestWeights;

  // Calculate final accuracy
  const finalAccuracy = evaluateModel(modelConfig, examples);

  console.log(`[NvidiaClient] Training complete: loss=${bestLoss.toFixed(4)}, accuracy=${(finalAccuracy * 100).toFixed(1)}%`);

  return {
    modelConfig,
    accuracy: finalAccuracy,
    loss: bestLoss,
    epochs
  };
}

/**
 * Step 4: Verify the trained LNN model with test scenarios.
 */
function verifyLnnModel(modelConfig, trainingData) {
  const inputMapping = modelConfig.input_mapping || {};
  const outputMapping = modelConfig.output_mapping || {};
  const inputSize = modelConfig.input_size;
  const outputSize = modelConfig.output_size;
  const hiddenUnits = modelConfig.hidden_units || 16;
  const outputTypes = modelConfig.output_types || {};

  const W_in = modelConfig.weights?.W_in || xavierInit(hiddenUnits, inputSize);
  const W_out = modelConfig.weights?.W_out || xavierInit(outputSize, hiddenUnits);
  const b_in = modelConfig.weights?.b_in || new Array(hiddenUnits).fill(0);
  const b_out = modelConfig.weights?.b_out || new Array(outputSize).fill(0);

  const results = {
    passed: 0,
    failed: 0,
    total: 0,
    details: []
  };

  // Use a subset of training data as test cases
  const testCases = trainingData.slice(0, Math.min(10, trainingData.length));

  for (const testCase of testCases) {
    const inputArr = new Array(inputSize).fill(0);
    const targetArr = new Array(outputSize).fill(0);

    if (testCase.inputs) {
      for (const [name, idx] of Object.entries(inputMapping)) {
        const val = testCase.inputs[name];
        if (val !== undefined && idx < inputSize) {
          inputArr[idx] = typeof val === 'number' ? val : parseFloat(val) || 0;
        }
      }
    }

    if (testCase.expected_outputs) {
      for (const [name, idx] of Object.entries(outputMapping)) {
        const val = testCase.expected_outputs[name];
        if (val !== undefined && idx < outputSize) {
          targetArr[idx] = typeof val === 'number' ? val : parseFloat(val) || 0;
        }
      }
    }

    // Forward pass
    const hidden = new Array(hiddenUnits).fill(0);
    for (let i = 0; i < hiddenUnits; i++) {
      let sum = b_in[i];
      for (let j = 0; j < inputSize; j++) {
        sum += W_in[i][j] * inputArr[j];
      }
      hidden[i] = Math.tanh(sum);
    }

    const output = new Array(outputSize).fill(0);
    for (let i = 0; i < outputSize; i++) {
      let sum = b_out[i];
      for (let j = 0; j < hiddenUnits; j++) {
        sum += W_out[i][j] * hidden[j];
      }
      output[i] = sigmoid(sum);
    }

    // Check each output
    let testPassed = true;
    const outputDetails = {};

    for (const [name, idx] of Object.entries(outputMapping)) {
      if (idx < outputSize) {
        const outType = outputTypes[name] || 'digital';
        const rawVal = output[idx];
        const targetVal = targetArr[idx];

        let actualCommand, targetCommand;
        if (outType === 'pwm') {
          actualCommand = Math.round(rawVal * 255);
          targetCommand = Math.round(targetVal * 255);
        } else if (outType === 'servo') {
          actualCommand = Math.round(rawVal * 180);
          targetCommand = Math.round(targetVal * 180);
        } else {
          actualCommand = rawVal > 0.5 ? 1 : 0;
          targetCommand = targetVal > 0.5 ? 1 : 0;
        }

        const isCorrect = outType === 'digital'
          ? actualCommand === targetCommand
          : Math.abs(actualCommand - targetCommand) <= Math.max(30, targetCommand * 0.3);

        if (!isCorrect) testPassed = false;
        outputDetails[name] = { actual: actualCommand, target: targetCommand, correct: isCorrect };
      }
    }

    results.total++;
    if (testPassed) {
      results.passed++;
    } else {
      results.failed++;
    }
    results.details.push({ inputs: testCase.inputs, outputs: outputDetails, passed: testPassed });
  }

  results.accuracy = results.total > 0 ? results.passed / results.total : 0;
  results.passedOverall = results.accuracy >= 0.6; // 60% pass rate is acceptable

  console.log(`[NvidiaClient] Verification: ${results.passed}/${results.total} tests passed (${(results.accuracy * 100).toFixed(1)}%)`);

  return results;
}

// ==================== HELPER FUNCTIONS ====================

function sigmoid(x) {
  if (x >= 0) {
    return 1.0 / (1.0 + Math.exp(-x));
  } else {
    const ex = Math.exp(x);
    return ex / (1.0 + ex);
  }
}

function xavierInit(rows, cols) {
  const limit = Math.sqrt(6.0 / (rows + cols));
  const matrix = [];
  for (let i = 0; i < rows; i++) {
    const row = [];
    for (let j = 0; j < cols; j++) {
      row.push((Math.random() * 2 - 1) * limit);
    }
    matrix.push(row);
  }
  return matrix;
}

function evaluateModel(modelConfig, examples) {
  const hiddenUnits = modelConfig.hidden_units || 16;
  const inputSize = modelConfig.input_size;
  const outputSize = modelConfig.output_size;
  const W_in = modelConfig.weights?.W_in || xavierInit(hiddenUnits, inputSize);
  const W_out = modelConfig.weights?.W_out || xavierInit(outputSize, hiddenUnits);
  const b_in = modelConfig.weights?.b_in || new Array(hiddenUnits).fill(0);
  const b_out = modelConfig.weights?.b_out || new Array(outputSize).fill(0);

  let correct = 0;
  for (const example of examples) {
    const hidden = new Array(hiddenUnits).fill(0);
    for (let i = 0; i < hiddenUnits; i++) {
      let sum = b_in[i];
      for (let j = 0; j < inputSize; j++) {
        sum += W_in[i][j] * example.input[j];
      }
      hidden[i] = Math.tanh(sum);
    }

    const output = new Array(outputSize).fill(0);
    for (let i = 0; i < outputSize; i++) {
      let sum = b_out[i];
      for (let j = 0; j < hiddenUnits; j++) {
        sum += W_out[i][j] * hidden[j];
      }
      output[i] = sigmoid(sum);
    }

    let exampleCorrect = true;
    for (let i = 0; i < outputSize; i++) {
      if (Math.abs(output[i] - example.target[i]) > 0.2) {
        exampleCorrect = false;
        break;
      }
    }
    if (exampleCorrect) correct++;
  }

  return examples.length > 0 ? correct / examples.length : 0;
}

/**
 * Full pipeline: Generate LNN architecture → Generate training data → Train → Verify
 * Emits progress events via the callback.
 */
async function generateAndTrainLnn({ robotData, pins, conversationHistory }, progressCallback) {
  const emit = (step, progress, message, extra = {}) => {
    if (progressCallback) {
      progressCallback({ step, progress, message, ...extra });
    }
  };

  // Step 1: Generate LNN Architecture
  emit('generating', 5, 'Generating LNN architecture...');
  const modelConfig = await generateLnnArchitecture({ robotData, pins, conversationHistory });
  emit('generating', 20, `Architecture: ${modelConfig.input_size}in → ${modelConfig.hidden_units}hidden → ${modelConfig.output_size}out`);

  // Step 2: Generate Training Data
  emit('creating_data', 25, 'Generating synthetic training data...');
  const trainingData = await generateTrainingData({ robotData, pins, modelConfig, conversationHistory });
  emit('creating_data', 40, `Generated ${trainingData.length} training examples`);

  // Step 3: Train LNN
  emit('training', 45, 'Training LNN (epoch 0/300)...');
  const trainResult = trainLnnModel(modelConfig, trainingData, {
    epochs: 300,
    learningRate: 0.02,
    onProgress: (epoch, loss, accuracy) => {
      const progress = 45 + Math.round((epoch / 300) * 35);
      emit('training', progress, `Training LNN (epoch ${epoch}/300, loss=${loss.toFixed(4)})`, { accuracy });
    }
  });
  emit('training', 80, `Training complete: accuracy ${(trainResult.accuracy * 100).toFixed(1)}%`, { accuracy: trainResult.accuracy });

  // Step 4: Check for Errors
  emit('checking', 82, 'Validating model configuration...');
  // Basic validation
  if (!modelConfig.input_size || !modelConfig.output_size) {
    throw new Error('Invalid model configuration: missing input_size or output_size');
  }
  if (!modelConfig.weights || !modelConfig.weights.W_in) {
    throw new Error('Training failed: weights not updated');
  }
  emit('checking', 88, 'Model configuration valid');

  // Step 5: Test LNN Behavior
  emit('testing', 90, 'Running behavior tests...');
  const verifyResult = verifyLnnModel(modelConfig, trainingData);
  emit('testing', 95, `Tests: ${verifyResult.passed}/${verifyResult.total} passed`, { accuracy: verifyResult.accuracy });

  if (!verifyResult.passedOverall) {
    console.warn('[NvidiaClient] Model verification below threshold, but proceeding with deployment');
  }

  // Step 6: Finalize
  emit('finalizing', 98, 'Finalizing model...');
  modelConfig.trained = true;
  modelConfig.training_info = {
    epochs: trainResult.epochs,
    final_loss: trainResult.loss,
    accuracy: trainResult.accuracy,
    verification_passed: verifyResult.passedOverall,
    verification_accuracy: verifyResult.accuracy,
    training_examples: trainingData.length
  };
  emit('complete', 100, 'LNN model ready!', { model_id: `lnn-${Date.now()}`, accuracy: trainResult.accuracy, config: modelConfig });

  return { modelConfig, accuracy: trainResult.accuracy, verification: verifyResult };
}

// Legacy function kept for backward compatibility
async function generateLnnModel({ robotData, pins, conversationHistory }) {
  return generateLnnArchitecture({ robotData, pins, conversationHistory });
}

module.exports = {
  sendChatCompletion,
  generateLnnModel,
  generateLnnArchitecture,
  generateTrainingData,
  trainLnnModel,
  verifyLnnModel,
  generateAndTrainLnn
};
