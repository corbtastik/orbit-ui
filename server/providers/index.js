import * as orbit from "./orbit.js";

// Registry rather than a switch: adding a provider is one import and one entry,
// and the route never grows a branch per vendor.
const PROVIDERS = { [orbit.id]: orbit };

export const getProvider = (id) => PROVIDERS[id] ?? null;

// checkHealth is optional -- only providers with a dependency beyond an API
// key implement it, and it is awaited so a dead MCP server is visible in the
// UI rather than discovered on the first question.
//
// checkConnections is the second half of that: a provider can be perfectly
// reachable and still have nothing registered to query, which fails every
// data question while looking healthy. Only asked when healthy, since the
// answer on a dead server is already known.
export const listProviders = async () =>
  Promise.all(
    Object.values(PROVIDERS).map(async (p) => {
      const healthy = p.checkHealth ? await p.checkHealth() : true;
      // null, not 0: "could not establish a count" and "counted zero" mean
      // different things, and only the second is worth warning about.
      const connections =
        healthy && p.checkConnections ? await p.checkConnections() : null;
      return { id: p.id, configured: p.isConfigured(), healthy, connections };
    })
  );
