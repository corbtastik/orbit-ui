// The providers the assistant can answer through. Kept as data rather than
// hardcoded into the selector so the transport layer and the UI agree on one
// list, and so a message carrying a provider id can always be labelled even
// if that provider is no longer offered.
//
// Only OrbitAI is offered. It is Claude with OrbitAI's MCP tools attached --
// 87 MongoDB and Atlas tools -- which is the whole point of the assistant, so
// a toolless Claude alongside it was a worse version of the same thing.
//
// The list is still an array because adding a provider back is one entry plus
// one transport mapping, and nothing above it has to change.
export const PROVIDERS = [
  { id: 'orbit', label: 'OrbitAI', short: 'OrbitAI' },
];

export const DEFAULT_PROVIDER = 'orbit';

// Falls back to the raw id so conversations stored under a provider that is no
// longer offered still render, rather than showing "unknown" or blank.
export function providerLabel(id) {
  return PROVIDERS.find((p) => p.id === id)?.short ?? id ?? 'unknown';
}
