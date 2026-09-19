import { MongoClient, BSON } from "mongodb";
import { log } from "../lib/log.js";

// The clusters the sidebar tree browses.
//
// This is a THIRD MongoDB relationship, and it is deliberately not either of
// the other two:
//
//   MONGODB_URI        chat history, written by this app (server/routes/chat.js)
//   the MCP server's   whatever the OrbitAI tools reach, with credentials this
//   own credentials    app never sees
//   ORBIT_CLUSTER_*    these -- browsed, read-only, never written
//
// They may well point at the same Atlas cluster, as they do on this machine.
// That is a coincidence of one developer's setup, not a design: each is
// configured separately so they can diverge without anything having to be
// rewired.
//
// Every call here reads: listDatabases, listCollections, $collStats, find and
// estimatedDocumentCount. There is no write path, and one should not be added
// -- these views are a window, and the tools are how the app changes anything.
//
// Configured in .env as numbered pairs, so adding a cluster is two lines:
//
//   ORBIT_CLUSTER_1_NAME=my-cluster
//   ORBIT_CLUSTER_1_URI=mongodb+srv://...
//
// NAME is optional; without it the host stands in.

/** Databases Atlas keeps for itself. Shown, but flagged, like Compass does. */
const SYSTEM_DBS = new Set(["admin", "config", "local"]);

/** id -> { id, name, uri, client } -- client is attached on first connect. */
const clusters = new Map();

// mongodb+srv://user:pass@my-cluster.abc123.mongodb.net/?opts -> my-cluster
function hostLabel(uri) {
  const match = /@([^/?,]+)/.exec(uri ?? "");
  return match ? match[1].split(".")[0] : "cluster";
}

/**
 * Reads the environment once, at boot. A connection string appearing in .env
 * later is a restart, which matches how every other setting here behaves.
 */
export function loadClusters(env = process.env) {
  const indices = new Set();
  for (const key of Object.keys(env)) {
    const m = /^ORBIT_CLUSTER_(\d+)_URI$/.exec(key);
    if (m && env[key]) indices.add(Number(m[1]));
  }

  for (const i of [...indices].sort((a, b) => a - b)) {
    const uri = env[`ORBIT_CLUSTER_${i}_URI`];
    const name = env[`ORBIT_CLUSTER_${i}_NAME`] || hostLabel(uri);
    const id = `c${i}`;
    clusters.set(id, { id, name, uri, client: null });
  }

  log(`clusters configured: ${clusters.size || "none"}`);
  return listConfigured();
}

/** Never includes a URI. Credentials have no business reaching the browser. */
export const listConfigured = () =>
  [...clusters.values()].map(({ id, name }) => ({ id, name }));

// Connected lazily and then kept. The tree is opened far more often than the
// process restarts, and a fresh handshake per expand would make every click
// wait on TLS.
async function clientFor(id) {
  const cluster = clusters.get(id);
  if (!cluster) return null;
  if (cluster.client) return cluster.client;

  // serverSelectionTimeoutMS is short on purpose: an unreachable cluster
  // should render as an error in the tree within a couple of seconds, not
  // hang the sidebar for the driver's 30-second default.
  const client = new MongoClient(cluster.uri, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  cluster.client = client;
  log(`[cluster ${id}] connected`);
  return client;
}

export async function listDatabases(id) {
  const client = await clientFor(id);
  if (!client) return null;

  const { databases } = await client.db().admin().listDatabases();
  return databases
    .map((d) => ({
      name: d.name,
      sizeOnDisk: d.sizeOnDisk ?? 0,
      system: SYSTEM_DBS.has(d.name) || d.name.startsWith("__"),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function listCollections(id, dbName) {
  const client = await clientFor(id);
  if (!client) return null;

  // nameOnly keeps this cheap: without it the driver asks each collection for
  // its full options, which on a large database is a lot of round trips for
  // data the tree does not show.
  const cols = await client.db(dbName).listCollections({}, { nameOnly: true }).toArray();
  return cols
    .map((c) => ({ name: c.name, type: c.type ?? "collection" }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Per-collection storage stats, for the collections table.
 *
 * $collStats rather than the legacy collStats command: the command is
 * deprecated and gone in newer servers, and this shape is what Atlas returns.
 * A collection whose stats cannot be read still gets a row with nulls -- one
 * unreadable view should not blank the table it appears in.
 */
export async function collectionStats(id, dbName) {
  const client = await clientFor(id);
  if (!client) return null;

  const db = client.db(dbName);
  const names = await db.listCollections({}, { nameOnly: true }).toArray();

  const rows = await Promise.all(
    names.map(async ({ name, type }) => {
      const base = { name, type: type ?? "collection" };
      try {
        const [stats] = await db
          .collection(name)
          .aggregate([{ $collStats: { storageStats: {} } }])
          .toArray();
        const st = stats?.storageStats ?? {};
        return {
          ...base,
          storageSize: st.storageSize ?? null,
          dataSize: st.size ?? null,
          count: st.count ?? null,
          avgObjSize: st.avgObjSize ?? null,
          indexes: st.nindexes ?? null,
          totalIndexSize: st.totalIndexSize ?? null,
        };
      } catch (err) {
        // A view has no storage stats, which is the usual reason to land here.
        log(`[cluster ${id}] ${dbName}.${name} stats unavailable: ${err?.message ?? err}`);
        return {
          ...base,
          storageSize: null, dataSize: null, count: null,
          avgObjSize: null, indexes: null, totalIndexSize: null,
        };
      }
    })
  );

  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

/** Hard ceiling on a page, so a crafted limit cannot ask for a whole collection. */
const MAX_PAGE = 100;

/**
 * One page of documents, serialised as canonical Extended JSON.
 *
 * Canonical rather than relaxed so an ObjectId stays {"$oid": ...} and a Date
 * stays {"$date": ...}. The viewer renders those as collapsible nodes, which
 * is the only way the reader can tell a real Date from a string that looks
 * like one.
 */
export async function findDocuments(id, dbName, collName, { skip = 0, limit = 25 } = {}) {
  const client = await clientFor(id);
  if (!client) return null;

  const size = Math.min(Math.max(1, limit), MAX_PAGE);
  const coll = client.db(dbName).collection(collName);

  const docs = await coll.find({}, { skip: Math.max(0, skip), limit: size }).toArray();

  // estimatedDocumentCount reads collection metadata instead of scanning, so
  // paging a large collection does not pay for a count on every page turn.
  // It is an estimate, and the UI says so.
  let total = null;
  try {
    total = await coll.estimatedDocumentCount();
  } catch {
    // A view cannot be counted this way; paging still works without a total.
  }

  return {
    documents: JSON.parse(BSON.EJSON.stringify(docs, { relaxed: false })),
    total,
    skip: Math.max(0, skip),
    limit: size,
  };
}

export async function closeClusters() {
  for (const cluster of clusters.values()) {
    await cluster.client?.close().catch(() => {});
  }
}
