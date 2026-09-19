import * as orbit from "./orbit.js";

// Registry rather than a switch: adding a provider is one import and one entry,
// and the route never grows a branch per vendor.
const PROVIDERS = { [orbit.id]: orbit };

export const getProvider = (id) => PROVIDERS[id] ?? null;

// checkHealth is optional -- only providers with a dependency beyond an API
// key implement it, and it is awaited so a dead MCP server is visible in the
// UI rather than discovered on the first question.
export const listProviders = async () =>
  Promise.all(
    Object.values(PROVIDERS).map(async (p) => ({
      id: p.id,
      configured: p.isConfigured(),
      healthy: p.checkHealth ? await p.checkHealth() : true,
    }))
  );
