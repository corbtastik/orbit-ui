import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { log } from "../lib/log.js";

// The MCP server keeps per-session state: each session gets its own database
// ConnectionManager, so `connect` and the calls that use that connection must
// land in the SAME session. The session is the `mcp-session-id` header the SDK
// captures from initialize and echoes on every POST -- which it does for us
// (streamableHttp.js:309 captures, :68 echoes), provided the same transport
// instance stays alive.
//
// Everything here exists to keep that instance alive. A connection torn down
// between tool calls produces a fresh session where `connect` never happened,
// and the next call fails with "No active MongoDB connection for this session."
//
// Sessions are keyed per conversation rather than per process: two chats would
// otherwise share one MongoDB connection, so `connect {"name":"atlas"}` in one
// would silently change what another is querying.

const MCP_URL = process.env.ORBIT_MCP_URL ?? "http://127.0.0.1:3600/mcp";

/** conversationId -> { client, transport } */
const sessions = new Map();

export const mcpUrl = () => MCP_URL;

// The server is POST-only: GET /mcp returns 404. After notifications/initialized
// the SDK still tries to open a GET SSE stream, fails, and routes the error
// here (streamableHttp.js:106 throws, :111 calls onerror). POST traffic is
// unaffected, so this is expected rather than a fault.
//
// Nothing in this handler reconnects. Treating a transport error as a reason to
// rebuild the connection is what breaks session affinity in the first place.
const SSE_404 = /Failed to open SSE stream|Not Found/i;

function installErrorHandler(transport, key) {
  transport.onerror = (err) => {
    const message = err?.message ?? String(err);
    if (SSE_404.test(message)) {
      log(`[${key}] SSE GET 404 ignored (server is POST-only)`);
      return;
    }
    log(`[${key}] transport error, connection KEPT: ${message}`);
  };
}

export async function getMcpClient(conversationId = "default") {
  const existing = sessions.get(conversationId);
  if (existing) return existing;

  const client = new Client({ name: "orbit-ui", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL));
  installErrorHandler(transport, conversationId);

  await client.connect(transport);

  const session = { client, transport };
  sessions.set(conversationId, session);
  log(`[${conversationId}] MCP session ${transport.sessionId ?? "(none)"} ESTABLISHED`);
  return session;
}

/**
 * Explicit teardown only -- when a conversation ends, not when a call fails.
 * No error path calls this, deliberately.
 */
export function closeMcpSession(conversationId = "default") {
  const session = sessions.get(conversationId);
  if (!session) return;
  sessions.delete(conversationId);
  session.client.close().catch(() => {});
}

/**
 * Passive: reports whether a live session exists and whether the server is
 * reachable at all, without disturbing anything. A status poll must never be
 * able to destroy a session that a conversation is mid-way through using.
 */
export async function isReachable() {
  try {
    const res = await fetch(MCP_URL, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "health", method: "ping" }),
    });
    // Any HTTP answer means the server is listening and speaking. The JSON-RPC
    // result does not matter -- this is a liveness check, not a handshake.
    return res.status > 0;
  } catch {
    return false;
  }
}

/** MCP tool definitions, shaped for the Anthropic Messages API. */
export async function listAnthropicTools(conversationId) {
  const { client } = await getMcpClient(conversationId);
  const { tools } = await client.listTools();
  return tools.map((t) => ({
    name: t.name,
    description: t.description ?? "",
    input_schema: t.inputSchema ?? { type: "object", properties: {} },
  }));
}

export async function callTool(conversationId, name, args) {
  const { client } = await getMcpClient(conversationId);
  const result = await client.callTool({ name, arguments: args ?? {} });

  const text = (result.content ?? [])
    .map((block) => (block.type === "text" ? block.text : `[${block.type} content omitted]`))
    .join("\n");

  return { text: text || "(the tool returned no content)", isError: Boolean(result.isError) };
}
