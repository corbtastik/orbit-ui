# orbit-ui

Chat UI for [OrbitAI](https://github.com/corbtastik/orbit) — conversational
access to MongoDB Atlas through MCP.

Ask in plain language; the assistant answers from real Atlas data by calling
OrbitAI's MCP tools. It is Claude with ~87 MongoDB and Atlas tools attached,
so the model is Claude and the API key is this app's, while the tools and the
Atlas credentials behind them belong to the OrbitAI MCP server.

## Running it

Three things have to be up, in this order.

**1. The OrbitAI MCP server**, in HTTP mode, from the OrbitAI repo:

```bash
cd ~/dev/github/corbtastik/orbit
./start-server.sh          # 127.0.0.1:3600, POST-only
```

**2. This app's API** — persistence and the model call:

```bash
npm install
cp .env.example .env       # fill in ANTHROPIC_API_KEY and MONGODB_URI
npm run server             # :4010
```

**3. The UI:**

```bash
npm run dev                # :5180, proxies /chat to :4010
```

Ports are 5180/4010 rather than the usual defaults so this can run alongside
other local apps.

## How it fits together

```
browser :5180
   │  POST /chat/stream            (SSE: token / retrieval / done / error)
   ▼
server :4010 ──► Anthropic Messages API
   │                │
   │                └── tool_use ──► OrbitAI MCP :3600 ──► Atlas
   │
   └──► MongoDB: the `orbitai` database (conversations only)
```

The browser never holds the Anthropic key and never speaks to the MCP server
directly. It could not anyway: the MCP server keeps per-session state, and a
browser tab cannot hold a session across a reload.

## Two MongoDB relationships, deliberately separate

`MONGODB_URI` stores **conversations only**, in the `orbitai` database
(`chat_projects`, `chat_conversations`). It is *not* what the OrbitAI tools
operate on — those reach Atlas with the MCP server's own credentials. Chat
history has no business sharing them, and the app should never be able to
reach a database it did not intend to touch.

## Layout

```
server/
  index.js              Mongo connection, two routers, health
  routes/chat.js        projects and conversations (persistence)
  routes/chatStream.js  SSE endpoint, abort wiring
  providers/orbit.js    the Claude + MCP tool loop
  providers/systemPrompt.js
  mcp/client.js         per-conversation MCP sessions
  lib/log.js            tool-traffic log -> logs/orbit.log
src/
  App.jsx               the whole UI
  components/chat/      transcript, composer, sidebar, retrieval card
  hooks/useChatStream.js  the transport seam
  brand/                vendored MongoDB LeafyGreen tokens — do not edit
```

## Notes worth knowing before changing things

- **Tool loops are slow.** A real answer runs 45–90 seconds across 20+ tool
  rounds. `logs/orbit.log` is the only place that is visible; tail it.
- **MCP sessions are per conversation and must stay alive.** `connect` and the
  calls depending on it have to land in the same session. Never reconnect on a
  tool error — see the comments in `server/mcp/client.js`.
- **`GET /mcp` returns 404 and that is expected.** The server is POST-only; the
  SDK tries to open an SSE stream anyway. It is suppressed, not a fault.
- **Abort is wired to `res.on("close")`, not `req`.** `req` close fires when
  the request body finishes, which would cancel every call before it started.
- **The mock transport is a feature.** Any unmapped provider id routes to it,
  and `/error`, `/stall`, `/empty`, `/slow` reach those UI states on demand
  without burning tokens.
- **The app is dark only.** No light theme, no toggle. See `src/brand/README.md`.

## Origin

The chat UI and its API were built inside
[incident-visualizer](https://github.com/corbtastik/incident-visualizer) and
lifted here to stand alone. That app keeps its own incident-specific
assistant; the two are independent from this point and are expected to
diverge.
