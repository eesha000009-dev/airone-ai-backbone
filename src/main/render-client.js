/**
 * Airone AI Backbone - Render API Client
 * Encapsulates all communication with the Render API for deploying
 * brain server web services.
 */

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const RENDER_API_BASE = 'https://api.render.com/v1';
const RENDER_API_KEY = 'rnd_4g4q8NK7SoDjx6MT4Q53aFYJwBON';
const BRAIN_SERVER_REPO = 'https://github.com/eesha000009-dev/airone-ide';
const BRAIN_SERVER_BRANCH = 'master';
const BRAIN_SERVER_ROOT_DIR = 'render-brain-server';
const POLL_INTERVAL_MS = 10000;  // 10 seconds
const POLL_TIMEOUT_MS = 180000;  // 3 minutes

/**
 * Deploy a brain service to Render.
 * Creates a web service (or updates an existing one with the same name),
 * then polls until it's live.
 *
 * @param {Object} params
 * @param {string} params.robotId - The robot's database ID
 * @param {string} params.robotName - The robot's name (used for service naming)
 * @param {Object} params.modelConfig - LNN model configuration object
 * @returns {Promise<Object>} { brain_url, api_key, service_id }
 */
async function deployBrainService({ robotId, robotName, modelConfig }) {
  // Generate a UUID for the robot's API key
  const apiKey = uuidv4();

  // Build a valid service name: lowercase, only a-z0-9 and hyphens
  const sanitizedName = (robotName || 'robot').toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const serviceName = `airone-brain-${sanitizedName}`;

  const envVars = [
    { key: 'MODEL_CONFIG', value: JSON.stringify(modelConfig) },
    { key: 'ROBOT_NAME', value: robotName || 'Unnamed' },
    { key: 'PORT', value: '10000' },
    { key: 'API_KEY', value: apiKey }
  ];

  const serviceConfig = {
    type: 'web_service',
    name: serviceName,
    runtime: 'python',
    repo: BRAIN_SERVER_REPO,
    branch: BRAIN_SERVER_BRANCH,
    rootDir: BRAIN_SERVER_ROOT_DIR,
    buildCommand: 'pip install -r requirements.txt',
    startCommand: 'python brain_server.py',
    envVars: envVars,
    plan: 'starter'
  };

  const headers = {
    'Authorization': `Bearer ${RENDER_API_KEY}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };

  try {
    // Check if a service with the same name already exists
    let existingServiceId = null;
    try {
      const listResponse = await axios.get(`${RENDER_API_BASE}/services`, {
        headers,
        timeout: 15000,
        params: { name: serviceName, limit: 10 }
      });

      const services = listResponse.data || [];
      for (const svc of services) {
        if (svc.service && svc.service.name === serviceName) {
          existingServiceId = svc.service.id;
          break;
        }
        // Handle case where the list returns service objects directly
        if (svc.name === serviceName) {
          existingServiceId = svc.id;
          break;
        }
      }
    } catch (listErr) {
      console.warn('[RenderClient] Could not list existing services:', listErr.message);
    }

    let serviceId;

    if (existingServiceId) {
      // Update the existing service
      console.log(`[RenderClient] Updating existing service: ${serviceName} (${existingServiceId})`);
      try {
        await axios.patch(`${RENDER_API_BASE}/services/${existingServiceId}`, {
          envVars: envVars
        }, { headers, timeout: 15000 });
      } catch (patchErr) {
        console.warn('[RenderClient] Could not update service env vars:', patchErr.message);
      }

      // Trigger a manual deploy
      try {
        const deployResponse = await axios.post(
          `${RENDER_API_BASE}/services/${existingServiceId}/deploys`,
          {},
          { headers, timeout: 15000 }
        );
        console.log('[RenderClient] Triggered manual deploy for existing service');
      } catch (deployErr) {
        console.warn('[RenderClient] Could not trigger manual deploy:', deployErr.message);
      }

      serviceId = existingServiceId;
    } else {
      // Create a new service
      console.log(`[RenderClient] Creating new service: ${serviceName}`);
      const createResponse = await axios.post(
        `${RENDER_API_BASE}/services`,
        serviceConfig,
        { headers, timeout: 30000 }
      );

      const createdService = createResponse.data;
      serviceId = createdService?.id || createdService?.service?.id;

      if (!serviceId) {
        throw new Error('No service ID returned from Render API');
      }
    }

    // Poll until the service is live
    console.log(`[RenderClient] Polling service ${serviceId} until live...`);
    const service = await pollUntilLive(serviceId, headers);

    // Build the brain WebSocket URL
    const hostname = service.suspenders?.[0]?.hostname || service.hostname;
    const brainUrl = hostname ? `wss://${hostname}` : '';

    console.log(`[RenderClient] Service deployed! Brain URL: ${brainUrl}`);

    return {
      brain_url: brainUrl,
      api_key: apiKey,
      service_id: serviceId
    };
  } catch (err) {
    if (err.response) {
      const status = err.response.status;
      const data = err.response.data;
      throw new Error(`Render API error (${status}): ${JSON.stringify(data)}`);
    }
    throw new Error(`Brain service deployment failed: ${err.message}`);
  }
}

/**
 * Poll the Render API until the service has deployStatus 'live'.
 *
 * @param {string} serviceId - The Render service ID
 * @param {Object} headers - Authorization headers
 * @returns {Promise<Object>} The service object when live
 */
async function pollUntilLive(serviceId, headers) {
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const response = await axios.get(
          `${RENDER_API_BASE}/services/${serviceId}`,
          { headers, timeout: 15000 }
        );

        const service = response.data;
        const status = service.deployStatus || service.status;

        console.log(`[RenderClient] Service ${serviceId} status: ${status}`);

        if (status === 'live') {
          resolve(service);
          return;
        }

        if (status === 'build_failed' || status === 'deploy_failed' || status === 'canceled') {
          reject(new Error(`Service deployment failed with status: ${status}`));
          return;
        }

        // Check timeout
        if (Date.now() - startTime > POLL_TIMEOUT_MS) {
          reject(new Error(`Service deployment timed out after ${POLL_TIMEOUT_MS / 1000}s (last status: ${status})`));
          return;
        }

        // Continue polling
        setTimeout(poll, POLL_INTERVAL_MS);
      } catch (err) {
        // Check timeout even on network errors
        if (Date.now() - startTime > POLL_TIMEOUT_MS) {
          reject(new Error(`Service deployment timed out after network errors`));
          return;
        }

        console.warn('[RenderClient] Poll error, retrying:', err.message);
        setTimeout(poll, POLL_INTERVAL_MS);
      }
    };

    poll();
  });
}

/**
 * Get the status of a Render service.
 *
 * @param {string} serviceId - The Render service ID
 * @returns {Promise<Object>} Service status object
 */
async function getServiceStatus(serviceId) {
  try {
    const response = await axios.get(
      `${RENDER_API_BASE}/services/${serviceId}`,
      {
        headers: {
          'Authorization': `Bearer ${RENDER_API_KEY}`,
          'Accept': 'application/json'
        },
        timeout: 15000
      }
    );
    return response.data;
  } catch (err) {
    if (err.response) {
      const status = err.response.status;
      const data = err.response.data;
      throw new Error(`Render API error (${status}): ${JSON.stringify(data)}`);
    }
    throw new Error(`Failed to get service status: ${err.message}`);
  }
}

module.exports = {
  deployBrainService,
  getServiceStatus
};
