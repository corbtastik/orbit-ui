# Design notes

Why this app is put together the way it is, and the things that will bite
someone changing it. For getting it running, see [README.md](../README.md).

## What it is

Claude with roughly 87 MongoDB and Atlas tools attached. The model is Claude and
the API key is this app's; the tools, and the Atlas credentials behind them,
belong to the OrbitAI MCP server. This app never sees those credentials.

## Architecture

### Processes and trust boundaries

```
┌─ your machine ─────────────────────────────────────────────────────────┐
│                                                                        │
│  ┌──────────────┐        ┌──────────────────┐     ┌─────────────────┐  │
│  │  browser     │        │  orbit-ui API    │     │ orbit-mcp-server│  │
│  │  :7001       │◄──────►│  :7002           │◄───►│ :3600  (POST)   │  │
│  │  (vite)      │  /chat │  express         │ MCP │ separate repo   │  │
│  └──────────────┘        └──────────────────┘     └─────────────────┘  │
│                                   │                        │           │
└───────────────────────────────────┼────────────────────────┼───────────┘
                                    │                        │
                   ┌────────────────┴───────┐                │
                   ▼                        ▼                ▼
          ┌─────────────────┐   ┌──────────────────┐  ┌──────────────┐
          │ Anthropic API   │   │ Atlas            │  │ Atlas        │
          │ (the model)     │   │ chat history +   │  │ (tools)      │
          │ ANTHROPIC_API_  │   │ browsed clusters │  │ MCP's own    │
          │ KEY             │   │ MONGODB_URI /    │  │ credentials  │
          └─────────────────┘   │ ORBIT_CLUSTER_*  │  └──────────────┘
                                └──────────────────┘
```

The browser holds no credentials and never reaches :3600 or Atlas directly. It
could not anyway — MCP sessions are stateful and a browser tab cannot hold one
across a reload.

### The chat loop

```
browser                orbit-ui API           Anthropic            MCP :3600
   │                        │                     │                    │
   │ POST /chat/stream      │                     │                    │
   ├───────────────────────►│                     │                    │
   │                        │ listTools()         │                    │
   │                        ├────────────────────────────────────────► │
   │                        │◄─ 87 tool defs ─────────────────────────┤
   │                        │                     │                    │
   │                        │  ┌── round 1..30 ──────────────────────┐ │
   │                        │  │ messages + tools │                  │ │
   │                        │  ├─────────────────►│                  │ │
   │  ◄── token ────────────┼──┤◄─ text deltas ───┤                  │ │
   │                        │  │◄─ tool_use ──────┤                  │ │
   │  ◄── retrieval ────────┼──┤                  │                  │ │
   │  ◄── context ──────────┼──┤ callTool() ──────┼─────────────────►│ │
   │  ◄── retrieval_result ─┼──┤◄─ result ────────┼──────────────────┤ │
   │                        │  │ results back ───►│                  │ │
   │                        │  └── until stop_reason ≠ tool_use ─────┘ │
   │  ◄── done ─────────────┤                     │                    │
   │                        │                     │                    │
   │ POST …/turns (once)    │──► Atlas (history)  │                    │
```

**This is agentic tool-calling, not RAG.** RAG is one-shot: retrieve, stuff the
prompt, generate. Here the model chooses tools iteratively from what the last
result said, and cannot know round 1's queries before seeing round 0's output.
That is why latency is open-ended rather than fixed, why `ORBIT_MAX_ITERATIONS`
exists as a guard at 30 rounds, and why tool results are capped at 4,000
characters before they re-enter the context.

The model is what decides which tool to call, reads the result and decides
whether to call another. MCP can list tools and run one; it can do neither of
those things. That is the whole reason this app needs a model API key despite
every tool living behind MCP.

### The browse path

```
browser ──► GET /chat/clusters                    ──► registry ──► Atlas
        ──► GET …/databases/:db/stats                 (read-only)
        ──► GET …/collections/:coll/documents
```

Separate connections, no MCP, no model. This is why the cluster tree and the
document views keep working when the model or the MCP server is unavailable.

### State that the diagrams do not show

- **MCP sessions are keyed per conversation.** `connect` and every call
  depending on it must land in the same session, so two chats cannot silently
  share a cluster.
- **Connection context is inferred** from tool arguments in flight, then
  replayed from the stored calls when a transcript is loaded.
- **History is written once per exchange**, after the reply completes — never
  per token.


## Three MongoDB relationships, deliberately separate

| | Who connects | Access |
|---|---|---|
| `MONGODB_URI` | orbit-ui API | read/write, the `orbitai` database only |
| `ORBIT_CLUSTER_*` | orbit-ui API | read-only: `listDatabases`, `listCollections`, `$collStats`, `find` |
| MCP credentials | orbit-mcp-server | all 87 tools, **including the 11 destructive ones** |

The third never passes through orbit-ui, and it is the one with no scoping.

They may all point at the same cluster, and on a dev machine they usually do.
That is a coincidence of one setup, not a design: they are configured apart so
they can stop coinciding without anything being rewired.

The sidebar tree deliberately does **not** go through the MCP server. `connect`
mutates per-conversation session state there, so a sidebar click could
otherwise silently change what a conversation is pointed at.

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
  components/md/        React wrappers around @material/web
  components/brand/     the OrbitAI mark and the icon component
  brand/                design tokens — see src/brand/README.md
shared/
  connectionContext.js  tool calls -> what a conversation is pointed at
scripts/
  build-theme.mjs       generates src/brand/tokens/colors.css
```

## Things that will bite you

- **Tool loops are slow.** A real answer runs 45–90 seconds across 20+ tool
  rounds. `logs/orbit.log` is the only place that is visible; tail it.
- **MCP sessions are per conversation and must stay alive.** `connect` and the
  calls depending on it have to land in the same session. Never reconnect on a
  tool error — see the comments in `server/mcp/client.js`.
- **`GET /mcp` returns 404 and that is expected.** The server is POST-only; the
  SDK tries to open an SSE stream anyway. It is suppressed, not a fault.
- **Abort is wired to `res.on("close")`, not `req`.** `req` close fires when the
  request body finishes, which would cancel every call before it started.
- **`node --watch` does not restart on `.env` changes.** dotenv reads it with
  `fs`, so it is not a tracked module. Touch a server file after editing config.
- **The browse views are read-only.** No POST, PATCH or DELETE on the router,
  and the registry behind it has no write path. Keep it that way — the tools are
  how the app changes anything.
- **The mock transport is a feature.** Any unmapped provider id routes to it, so
  `/error`, `/stall`, `/empty` and `/slow` reach those UI states without burning
  tokens.
- **Document tables describe the page, not the collection.** Columns are the
  union of the keys on the current page, so page two may have columns page one
  did not. That is honest for a polymorphic collection; a stable header would
  mean a full scan per page turn.
- **An absent field is not a null field.** The table renders absent as an empty
  hatched cell and null as `null`. Presence is tested with `Object.hasOwn`, not
  truthiness — a field holding `0`, `""` or `false` is present.
- **Neither database gates startup.** The API listens before chat history is
  connected and retries in the background with backoff, so an Atlas blip
  degrades history rather than preventing the app from starting. `/health`
  answers `ok:1` with `chatHistory: "unavailable"`; routes that need it return
  503, and the sidebar offers a retry. Browsed clusters were already per-cluster
  tolerant. Verified by starting against a dead database and bringing a real
  one up underneath without restarting.
- **Tool calls are kept per turn, not per message.** The transcript stores an
  array of them with full arguments; results are clipped to 4,000 characters
  before they leave the server, because twenty uncapped results a turn would
  make transcripts megabytes against a 16MB document limit. The whole result
  is always in `logs/orbit.log`.
- **Connection context is inferred, not declared.** The MCP server holds the
  connection state and does not report it, so the header reads it off the tool
  calls going past. It only ever adds: a call with no `database` argument does
  not mean the database was cleared. The rule lives in
  `shared/connectionContext.js` because it has to run on the server, in the
  client when a transcript loads, and in the tests — replayed from the stored
  calls rather than persisted, so it needs no schema change and lights up
  conversations recorded before the indicator existed.
- **Paging uses `skip`.** Fine at these depths, expensive thousands of documents
  in. A range query is the fix if that ever matters.

## The design system

Material 3, on the Star Lord palette from
[yolo-11ty](https://github.com/corbtastik/yolo-11ty). The full account is in
[src/brand/README.md](../src/brand/README.md); the short version:

**Colours are generated, not written.** `src/brand/tokens/colors.css` comes from
`npm run build:theme`, which runs Google's `material-color-utilities` over five
source colours. Do not edit it by hand.

**One deliberate deviation from the spec.** M3's dark scheme takes `primary`
from tone 80, which for this palette is a pastel. `primary` is pinned to the
source `#FF5DA2` instead, and the three roles that pair with it are re-derived
from the same tonal palette to suit. The other 48 roles are untouched.

**The typefaces are not M3's.** Montserrat, Space Mono and Source Code Pro
rather than Roboto. M3 is explicit that a brand font can be substituted into its
scale.

**Components are `@material/web` where one exists.** Buttons, icon buttons, text
fields, select, list items, menu, dialog and progress. They are wrapped for
React in `src/components/md/index.jsx` — one file, so the dependency has exactly
one seam.

**Six components are hand-built and will stay that way.** Material Web ships no
navigation drawer, top app bar, card, snackbar, segmented button or tooltip, and
it is in maintenance mode, so it never will. Each is built to the published spec
on the same `--md-sys-*` tokens.

**The tab bar is hand-built by choice.** Its tabs carry close controls, which
`md-tabs` does not expect — it owns activation and treats each tab as a single
target.

**Tooltips are native `title` attributes.** A hand-built tooltip would need
focus management, hover delays and positioning to match what the browser already
does correctly for keyboards and screen readers.

**The app is dark only.** No light theme and no toggle; there is no
`[data-theme]` selector and nothing reads one.

### Known dependency risk

`@material/web` is in maintenance mode: bug fixes only, no new components. It is
stable and still published, but nothing further is coming. That is the reason
the six components above are permanent rather than temporary.

## One coupling worth knowing about

The composer grows with its content by reaching through the Material text
field's shadow root to measure the textarea inside it. Material Web keeps that
reference private and ships no auto-grow and no resize hook, and driving `rows`
from a guess at the wrapped line count makes the box jump. The shadow root is
open, so this is reachable rather than a hack against encapsulation — but it is
the one place in the app that depends on a Material Web internal, and it is
commented as such in `src/components/chat/Composer.jsx`.

## Origin

The chat UI and its API were built inside incident-visualizer and lifted here to
stand alone. The two are independent and expected to diverge.
