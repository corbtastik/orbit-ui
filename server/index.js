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

  const client = new MongoClient(MONGODB_URI);
  await client.connect();

  // Routes take this rather than the client, so none of them can reach a
  // database this app did not intend to touch.
  const getDb = (dbName = DB_NAME) => client.db(dbName);

  console.log("[BOOT] Connected", { uri: redact(MONGODB_URI), db: DB_NAME });

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

  app.get("/health", async (_req, res) => {
    try {
      await getDb().command({ ping: 1 });
      res.json({ ok: 1, db: DB_NAME });
    } catch (e) {
      res.status(500).json({ ok: 0, error: e?.message });
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
