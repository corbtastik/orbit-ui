# orbit-ui

Chat client for [OrbitAI](https://github.com/corbtastik/orbit) — conversational
access to MongoDB Atlas through MCP.

Ask in plain language; the assistant answers from real Atlas data by calling
OrbitAI's MCP tools. A sidebar tree browses the configured clusters, and
clicking a database or collection opens it in a tab beside the chat.

It is Claude with ~87 MongoDB and Atlas tools attached: the model is Claude and
the API key is this app's, while the tools and the Atlas credentials behind them
belong to the OrbitAI MCP server.

## Running it

**1. The OrbitAI MCP server**, in HTTP mode, from its own repo. It is a separate
application and is not started by anything here:

```bash
cd ~/dev/github/corbtastik/orbit
./start-server.sh          # 127.0.0.1:3600, POST-only
```

**2. This app:**

```bash
npm install
cp .env.example .env       # fill in ANTHROPIC_API_KEY and MONGODB_URI
./start-all.sh             # API on :7002, UI on :7001
```

`start-all.sh` refuses to run unless the MCP server is already answering, waits
for each process to come up before starting the next, and Ctrl-C stops both. To
run them separately: `npm run server` and `npm run dev`.

Open <http://localhost:7001>.

## Configuration

All of it lives in `.env` — see `.env.example` for the full list.

| | |
|---|---|
| `ANTHROPIC_API_KEY` | required |
| `MONGODB_URI` | required — chat history |
| `ORBIT_CLUSTER_1_URI` | a cluster for the sidebar tree; add more by number |
| `ORBIT_MCP_URL` | defaults to `http://127.0.0.1:3600/mcp` |

## Three MongoDB relationships, deliberately separate

    MONGODB_URI       chat history         written by this app, `orbitai` db
    MCP credentials   whatever the tools   never seen by this app
                      reach
    ORBIT_CLUSTER_*   the sidebar tree     read-only, never written

They may all point at the same cluster, and usually do. That is a coincidence of
one setup, not a design — they are configured apart so they can stop coinciding
without anything being rewired.

## Layout

```
server/
  index.js              Mongo connection, routers, health
  routes/chat.js        projects and conversations
  routes/chatStream.js  SSE endpoint, abort wiring
  routes/clusters.js    the sidebar tree and browse views (read-only)
  clusters/registry.js  ORBIT_CLUSTER_* -> connections
  providers/orbit.js    the Claude + MCP tool loop
  mcp/client.js         per-conversation MCP sessions
src/
  App.jsx               shell, tabs
  components/chat/      transcript, composer, sidebar, cluster tree
  components/browse/    collections table, paged documents, EJSON viewer
  components/brand/     the OrbitAI mark
  brand/                theme tokens — see src/brand/README.md
```

## Worth knowing before changing things

- **Tool loops are slow.** A real answer runs 45–90 seconds across 20+ tool
  rounds. `logs/orbit.log` is the only place that is visible; tail it.
- **MCP sessions are per conversation and must stay alive.** `connect` and the
  calls depending on it have to land in the same session. Never reconnect on a
  tool error — see the comments in `server/mcp/client.js`.
- **`GET /mcp` returns 404 and that is expected.** The server is POST-only; the
  SDK tries to open an SSE stream anyway. It is suppressed, not a fault.
- **Abort is wired to `res.on("close")`, not `req`.** `req` close fires when the
  request body finishes, which would cancel every call before it started.
- **The browse views are read-only.** No POST, PATCH or DELETE, and the registry
  behind them has no write path.
- **`node --watch` does not restart on `.env` changes.** dotenv reads it with
  `fs`, so it is not a tracked module. Touch a server file after editing config.
- **The mock transport is a feature.** Any unmapped provider id routes to it, so
  `/error`, `/stall`, `/empty` and `/slow` reach those UI states without burning
  tokens.
- **The app is dark only.** No light theme, no toggle. See `src/brand/README.md`.

## Origin

The chat UI and its API were built inside incident-visualizer and lifted here to
stand alone. The two are independent and expected to diverge.
