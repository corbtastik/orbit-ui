import express from "express";
import { listConfigured, listBuckets, listObjects, statObject } from "../storage/registry.js";

// The object-storage tree. Read-only by construction: there is no POST, PATCH
// or DELETE here, and the registry behind it exposes no write.
//
// Buckets come with the store list because ListBuckets is one cheap call and
// the tree shows them immediately -- the same bargain the cluster route makes
// with listDatabases. Objects are fetched per bucket, on expand.

export default function makeStorageRouter() {
  const router = express.Router();

  const fail = (res, err, message) => {
    console.error(`[storage] ${message}:`, err?.message ?? err);
    // The underlying message can name the endpoint and the access key, so it
    // is logged in full and summarised to the browser.
    res.status(502).json({ error: message });
  };

  router.get("/chat/storage", async (_req, res) => {
    const configured = listConfigured();

    // Each store resolves independently: one unreachable endpoint should
    // appear as an error on its own row, not blank the whole tree.
    const stores = await Promise.all(
      configured.map(async (s) => {
        try {
          return { ...s, status: "ok", buckets: await listBuckets(s.id) };
        } catch (err) {
          console.error(`[storage] ${s.id} unreachable:`, err?.message ?? err);
          return { ...s, status: "error", error: "could not reach this endpoint", buckets: [] };
        }
      })
    );

    res.json({ stores });
  });

  router.get("/chat/storage/:id/buckets/:bucket/objects", async (req, res) => {
    const limit = Number.parseInt(req.query.limit, 10);
    try {
      const page = await listObjects(req.params.id, req.params.bucket, {
        prefix: req.query.prefix ?? "",
        // Opaque and forward-only: it comes from a previous page's nextToken
        // and means nothing to anyone but the endpoint that issued it.
        token: req.query.token ?? "",
        limit: Number.isFinite(limit) ? limit : 50,
      });
      if (page === null) {
        return res.status(404).json({ error: `unknown store: ${req.params.id}` });
      }
      res.json(page);
    } catch (err) {
      fail(res, err, "could not list this bucket");
    }
  });

  // Metadata only. Object contents are deliberately not served yet: doing so
  // turns this API into a proxy for arbitrary bytes, which needs a size
  // ceiling and a content-type policy decided on purpose rather than reached
  // by accident.
  router.get("/chat/storage/:id/buckets/:bucket/stat", async (req, res) => {
    const key = req.query.key;
    if (!key) return res.status(400).json({ error: "key is required" });
    try {
      const meta = await statObject(req.params.id, req.params.bucket, key);
      if (meta === null) {
        return res.status(404).json({ error: `unknown store: ${req.params.id}` });
      }
      res.json(meta);
    } catch (err) {
      fail(res, err, "could not stat this object");
    }
  });

  return router;
}
