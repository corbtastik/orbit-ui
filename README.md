# orbit-ui

Chat client for [OrbitAI](https://github.com/corbtastik/orbit) — conversational
access to MongoDB Atlas through MCP.

Ask in plain language and the assistant answers from real Atlas data by calling
OrbitAI's MCP tools. A sidebar browses your configured clusters and object
stores; clicking a database, collection or bucket opens it in a tab beside the
chat. Press <kbd>⌘K</kbd> to search across all of it and your chat history at
once.

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

Open <http://localhost:7001>. The header shows whether the MCP server is
reachable — without it, every question fails.

`start-all.sh` refuses to start if the MCP server is down, and warns (but
continues) if a configured object store is unreachable. To run the two halves
separately: `npm run server` and `npm run dev`.

## Configuration

Everything is read from `.env` at startup. **Nothing is `VITE_`-prefixed, so
none of it reaches the browser bundle** — credentials stay in the API process.
Changing a value means restarting the API.

`.env` is gitignored. `.env.example` is the annotated template.

### Required

| | |
|---|---|
| `ANTHROPIC_API_KEY` | The model is Claude; MCP serves tools, not completions. |
| `MONGODB_URI` | Where conversations are stored. Only ever the `orbitai` database. |

### The four data relationships

These are deliberately separate, and the separation is the point:

| | Reaches | Access |
|---|---|---|
| `MONGODB_URI` | this API | read/write, the `orbitai` database only |
| `ORBIT_CLUSTER_*` | this API | read-only browsing for the sidebar |
| `ORBIT_OBJECT_*` | this API | read-only browsing for the sidebar |
| MCP credentials | the MCP server | all 87 tools, **including destructive ones** |

The last is configured in the OrbitAI repo and **this app never sees it**. The
first three may all point at the same place — on a dev machine they usually do
— but they are configured apart so they can stop coinciding without anything
being rewired.

### Browsed clusters

Numbered groups. Add a cluster by adding another with the next number:

```bash
ORBIT_CLUSTER_1_NAME=corbs-demo        # optional; the host stands in
ORBIT_CLUSTER_1_URI=mongodb+srv://user:pass@cluster/...
```

Read-only: the tree calls `listDatabases`, `listCollections`, `$collStats` and
`find`, and there is no write path behind it.

### Browsed object storage

Optional. S3-compatible — MinIO, AIStor, S3 itself. With none configured the
Object Storage section does not appear at all.

```bash
ORBIT_OBJECT_1_NAME=localdev           # optional; the host stands in
ORBIT_OBJECT_1_ENDPOINT=https://localhost:9000
ORBIT_OBJECT_1_KEY=...
ORBIT_OBJECT_1_SECRET=...
ORBIT_OBJECT_1_REGION=us-east-1        # optional, defaults to us-east-1
ORBIT_OBJECT_1_INSECURE=true           # optional; see below
```

Read-only: `ListBuckets`, `ListObjectsV2`, `HeadObject`. Requests are signed
with SigV4 directly, without an S3 SDK.

`_INSECURE` accepts a self-signed certificate, which a local MinIO generates
for itself. **It is per endpoint on purpose.** The global alternative,
`NODE_TLS_REJECT_UNAUTHORIZED=0`, would also stop verifying the Atlas and MCP
connections this process makes — one dev convenience quietly weakening two
unrelated things.

An endpoint that is down is not fatal: the section shows an error row, and it
recovers on its own once the endpoint comes back. No restart needed.

### Optional, with defaults

| | Default | |
|---|---|---|
| `ORBIT_MCP_URL` | `http://127.0.0.1:3600/mcp` | Where the MCP server listens. |
| `PORT` | `7002` | The API port. See the warning below. |
| `ORBIT_DB_NAME` | `orbitai` | Database used for chat history. |
| `CLAUDE_MODEL` | `claude-opus-5` | |
| `ORBIT_MAX_ITERATIONS` | `30` | Rounds of the tool loop, not individual calls — parallel calls in one round count once. |
| `ORBIT_LOG_FILE` | `logs/orbit.log` | Tool traffic; a single answer can span 20+ rounds. |
| `NODE_ENV` | — | Set to `production` to disable the unauthenticated `/chat/client-error` log endpoint. |

> **`PORT` is not as configurable as it looks.** `vite.config.js` hardcodes
> `7001` and proxies `/chat` to `7002`. Changing `PORT` alone produces a UI
> that loads and then fails every request — the least obvious way for this to
> break. Both files have to agree.

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
server/     API: chat history, the model + MCP tool loop, cluster and
            object-store browsing
shared/     logic that has to run on both sides
src/        React app: chat, sidebar trees, collection, document and
            object views
src/brand/  Material 3 design tokens
docs/       architecture and demo prompts
```

## More

- [docs/DESIGN.md](docs/DESIGN.md) — architecture, the design system, and the
  non-obvious constraints worth knowing before changing things
- [docs/DEMO.md](docs/DEMO.md) — a ten-minute demo script for the incidents data
- [docs/EXAMPLES.md](docs/EXAMPLES.md) — twenty more prompts, with notes on speed
- [src/brand/README.md](src/brand/README.md) — theme tokens and components
