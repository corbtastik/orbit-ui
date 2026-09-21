// server/index.js (ESM)
//
// Two jobs, and only two: persist conversations, and proxy the model call.
//
// The browser never holds the Anthropic key and never speaks to the MCP
// server directly, so both of those have to live behind this process. The
// MCP server also keeps per-session state -- see mcp/client.js -- which a
// browser tab could not hold onto across a reload anyway.
import "dotenv/config";
import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";

import makeChatRouter from "./routes/chat.js";
import makeChatStreamRouter from "./routes/chatStream.js";
import makeClustersRouter from "./routes/clusters.js";
import { loadClusters, closeClusters } from "./clusters/registry.js";
import { log } from "./lib/log.js";

const MONGODB_URI = process.env.MONGODB_URI;

// Conversations only. This is deliberately NOT the database the OrbitAI tools
// operate on -- those reach Atlas with the MCP server's own credentials, and
// chat history has no business sharing them.
const DB_NAME = process.env.ORBIT_DB_NAME || "orbitai";
const PORT = process.env.PORT || 7002;

const redact = (uri) =>
  (uri || "").replace(/(mongodb\+srv:\/\/)([^:]+):([^@]+)@/i, "$1***:***@");

async function main() {
  if (!MONGODB_URI) {
    console.error("Missing MONGODB_URI in environment");
    process.exit(1);
  }

  // Connecting does NOT gate the server starting.
  //
  // This used to `await client.connect()` and exit on failure, so an Atlas
  // blip meant the API never listened, start-all.sh waited for a port that
  // would never open, and the UI never came up at all. Chat history being
  // unreachable is a reason for the history to be unavailable -- it is not a
  // reason to be unable to browse clusters or read the page.
  //
  // Retried in the background instead, so the app heals on its own when Atlas
  // comes back rather than needing a restart.
  const client = new MongoClient(MONGODB_URI);
  let dbReady = false;
  let dbError = null;

  const connectWithRetry = async () => {
    // Backs off to a minute: an outage lasts minutes, and hammering it every
    // second fills the log without arriving any sooner.
    let delay = 1000;
    for (;;) {
      try {
        await client.connect();
        await client.db(DB_NAME).command({ ping: 1 });
        dbReady = true;
        dbError = null;
        console.log("[BOOT] Connected", { uri: redact(MONGODB_URI), db: DB_NAME });
        return;
      } catch (err) {
        dbReady = false;
        dbError = err?.message ?? String(err);
        log(`chat history unavailable, retrying in ${delay}ms: ${dbError}`);
        await new Promise((r) => setTimeout(r, delay));
        delay = Math.min(delay * 2, 60000);
      }
    }
  };
  connectWithRetry();

  // Routes take this rather than the client, so none of them can reach a
  // database this app did not intend to touch.
  //
  // Throws while the connection is down rather than returning a client whose
  // every operation would hang until the driver's own timeout -- the route
  // above it turns that into a 503 immediately.
  const getDb = (dbName = DB_NAME) => {
    if (!dbReady) {
      const err = new Error("chat history is unavailable");
      err.status = 503;
      throw err;
    }
    return client.db(dbName);
  };

  const app = express();
  app.use(cors());
  app.use(express.json());

  // One line per request. Tool loops run 45-90 seconds across 20+ rounds, and
  // when one goes wrong the first question is always whether the browser even
  // made the call.
  app.use((req, res, next) => {
    const started = Date.now();
    res.on("finish", () =>
      log(`HTTP ${req.method} ${req.originalUrl} -> ${res.statusCode} in ${Date.now() - started}ms`)
    );
    next();
  });

  // Client-side errors land in the same log file as everything else.
  // Unauthenticated write to a log: fine on a developer machine, not somewhere
  // reachable from outside, hence the production guard.
  app.post("/chat/client-error", (req, res) => {
    if (process.env.NODE_ENV === "production") return res.status(404).end();
    log(`CLIENT ERROR ${req.body?.message ?? "(none)"}\n${req.body?.stack ?? ""}`);
    res.json({ ok: 1 });
  });

  // Reports the database separately from the process. start-all.sh waits on
  // this, and the API being up with history degraded is a healthy state --
  // answering 500 here would put us back to never starting the UI.
  app.get("/health", async (_req, res) => {
    if (!dbReady) {
      return res.json({ ok: 1, db: DB_NAME, chatHistory: "unavailable", error: dbError });
    }
    try {
      await getDb().command({ ping: 1 });
      res.json({ ok: 1, db: DB_NAME, chatHistory: "ok" });
    } catch (e) {
      res.json({ ok: 1, db: DB_NAME, chatHistory: "unavailable", error: e?.message });
    }
  });

  // /chat/projects, /chat/conversations
  app.use(makeChatRouter({ getDb }));

  // /chat/providers, /chat/stream
  app.use(makeChatStreamRouter());

  // /chat/clusters -- the sidebar tree. Read from ORBIT_CLUSTER_* in .env,
  // which is a separate relationship from MONGODB_URI above; see
  // server/clusters/registry.js.
  const configured = loadClusters();
  console.log("[BOOT] Clusters", configured.map((c) => c.name));
  app.use(makeClustersRouter());

  app.listen(PORT, () => console.log(`OrbitAI UI API listening on http://localhost:${PORT}`));

  process.on("SIGINT", async () => {
    console.log("\nShutting down...");
    await client.close().catch(() => {});
    await closeClusters();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
