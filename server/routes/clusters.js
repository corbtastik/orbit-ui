import express from "express";
import {
  listConfigured,
  listDatabases,
  listCollections,
  collectionStats,
  findDocuments,
} from "../clusters/registry.js";
import { describeError } from "../lib/describeError.js";

// The sidebar tree. Read-only by construction: there is no POST, PATCH or
// DELETE here, and the registry behind it exposes no write.
//
// Databases come with the cluster list because listDatabases is one cheap
// call and the tree shows them immediately. Collections are fetched per
// database on expand -- a cluster with thirty databases should not pay for
// thirty listCollections nobody asked to see.

export default function makeClustersRouter() {
  const router = express.Router();

  const fail = (res, err, message) => {
    console.error(`[clusters] ${message}:`, describeError(err));
    // The driver's message names the host and sometimes the user, so it is
    // logged in full and summarised to the browser.
    res.status(502).json({ error: message });
  };

  router.get("/chat/clusters", async (_req, res) => {
    const configured = listConfigured();

    // Each cluster resolves independently: one unreachable cluster should
    // appear as an error on its own row, not blank the whole tree.
    const clusters = await Promise.all(
      configured.map(async (c) => {
        try {
          return { ...c, status: "ok", databases: await listDatabases(c.id) };
        } catch (err) {
          console.error(`[clusters] ${c.id} unreachable:`, describeError(err));
          return { ...c, status: "error", error: "could not reach this cluster", databases: [] };
        }
      })
    );

    res.json({ clusters });
  });

  router.get("/chat/clusters/:id/databases/:db/collections", async (req, res) => {
    try {
      const collections = await listCollections(req.params.id, req.params.db);
      if (collections === null) {
        return res.status(404).json({ error: `unknown cluster: ${req.params.id}` });
      }
      res.json({ collections });
    } catch (err) {
      fail(res, err, "could not list collections");
    }
  });

  // The collections table for one database.
  router.get("/chat/clusters/:id/databases/:db/stats", async (req, res) => {
    try {
      const collections = await collectionStats(req.params.id, req.params.db);
      if (collections === null) {
        return res.status(404).json({ error: `unknown cluster: ${req.params.id}` });
      }
      res.json({ collections });
    } catch (err) {
      fail(res, err, "could not read collection stats");
    }
  });

  // One page of documents. skip/limit come from the query string; the registry
  // caps limit, so a hand-edited URL cannot ask for the whole collection.
  router.get("/chat/clusters/:id/databases/:db/collections/:coll/documents", async (req, res) => {
    const skip = Number.parseInt(req.query.skip, 10);
    const limit = Number.parseInt(req.query.limit, 10);
    try {
      const page = await findDocuments(req.params.id, req.params.db, req.params.coll, {
        skip: Number.isFinite(skip) ? skip : 0,
        limit: Number.isFinite(limit) ? limit : 25,
      });
      if (page === null) {
        return res.status(404).json({ error: `unknown cluster: ${req.params.id}` });
      }
      res.json(page);
    } catch (err) {
      fail(res, err, "could not read documents");
    }
  });

  return router;
}
