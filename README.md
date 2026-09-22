# orbit-ui

Chat client for [OrbitAI](https://github.com/corbtastik/orbit) — conversational
access to MongoDB Atlas through MCP.

Ask in plain language and the assistant answers from real Atlas data by calling
OrbitAI's MCP tools. A sidebar tree browses your configured clusters; clicking a
database or collection opens it in a tab beside the chat.

## Running it

**1. Start the OrbitAI MCP server** from its own repo. It is a separate
application and nothing here starts it:

```bash
cd ~/dev/github/corbtastik/orbit
./start-server.sh          # 127.0.0.1:3600
```

**2. Start this app:**

```bash
npm install
cp .env.example .env       # fill in ANTHROPIC_API_KEY and MONGODB_URI
./start-all.sh             # API on :7002, UI on :7001
```

Open <http://localhost:7001>.

To run the two halves separately: `npm run server` and `npm run dev`.

## Configuration

Everything lives in `.env` — see `.env.example` for the full list.

| | |
|---|---|
| `ANTHROPIC_API_KEY` | required |
| `MONGODB_URI` | required — where chat history is stored |
| `ORBIT_CLUSTER_1_URI` | a cluster for the sidebar tree; add more by number |
| `ORBIT_OBJECT_1_ENDPOINT` | optional — an S3-compatible store for the sidebar |
| `ORBIT_MCP_URL` | defaults to `http://127.0.0.1:3600/mcp` |

The MongoDB settings are three separate connections on purpose. `MONGODB_URI`
stores conversations, `ORBIT_CLUSTER_*` is browsed read-only, and the OrbitAI
tools reach Atlas with the MCP server's own credentials, which this app never
sees. `ORBIT_OBJECT_*` is a fourth thing again: S3-compatible object storage,
also browsed read-only, and hidden entirely when nothing is configured.

## Scripts

```bash
npm run dev            # UI, :7001
npm run server         # API, :7002
npm test               # vitest
npm run build          # production build
npm run build:theme    # regenerate the colour tokens
```

## Layout

```
server/     API: chat history, the model + MCP tool loop, cluster browsing
src/        React app: chat, cluster tree, collection and document views
src/brand/  Material 3 design tokens
```

## More

- [docs/DESIGN.md](docs/DESIGN.md) — architecture, the design system, and the
  non-obvious constraints worth knowing before changing things
- [docs/EXAMPLES.md](docs/EXAMPLES.md) — demo prompts for the incidents data
- [src/brand/README.md](src/brand/README.md) — theme tokens and components
