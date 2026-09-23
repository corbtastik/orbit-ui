import express from "express";
import { listConfigured, listBuckets, listObjects, statObject, openObject } from "../storage/registry.js";
import { describeError } from "../lib/describeError.js";

// The object-storage tree. Read-only by construction: there is no POST, PATCH
// or DELETE here, and the registry behind it exposes no write.
//
// Buckets come with the store list because ListBuckets is one cheap call and
// the tree shows them immediately -- the same bargain the cluster route makes
// with listDatabases. Objects are fetched per bucket, on expand.

export default function makeStorageRouter() {
  const router = express.Router();

  const fail = (res, err, message) => {
    console.error(`[storage] ${message}:`, describeError(err));
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
          console.error(`[storage] ${s.id} unreachable:`, describeError(err));
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

  /**
   * Object bytes, streamed.
   *
   * This API becomes a proxy here, which was worth deciding rather than
   * drifting into. The alternative -- handing the browser a presigned URL --
   * does not work against a local MinIO: the certificate is self-signed, so a
   * browser fetching it as a subresource from another origin blocks it with
   * no way to click through. Proxying also keeps the credentials server-side,
   * which was already the rule everywhere else here.
   *
   * Piped, never buffered, so a 45MB video costs no more memory than a 2KB
   * JSON document. Range travels through unchanged, which is what lets a
   * browser seek media rather than pull the whole file first.
   *
   * Content-Disposition is forced to inline and the type is passed through
   * from the store. An object is rendered, never offered as a download: this
   * is a browser, and the tools are how the app moves data.
   */
  router.get("/chat/storage/:id/buckets/:bucket/content", async (req, res) => {
    const key = req.query.key;
    if (!key) return res.status(400).json({ error: "key is required" });

    try {
      const extra = req.headers.range ? { Range: req.headers.range } : {};
      const object = await openObject(req.params.id, req.params.bucket, key, extra);
      if (object === null) {
        return res.status(404).json({ error: `unknown store: ${req.params.id}` });
      }

      const { status, headers, stream } = object;
      // Only the headers a viewer needs. The store's own x-amz-* and its
      // server identity are not the browser's business.
      for (const name of ["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified"]) {
        if (headers[name]) res.setHeader(name, headers[name]);
      }
      // Without this a browser may sniff an object into something executable.
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Disposition", "inline");
      res.status(status);

      stream.pipe(res);

      // A reader who closes the tab mid-video should not leave this pulling
      // the remaining forty megabytes into a socket nobody is reading.
      res.on("close", () => stream.destroy());
      stream.on("error", (err) => {
        console.error("[storage] object stream failed:", describeError(err));
        res.destroy();
      });
    } catch (err) {
      fail(res, err, "could not read this object");
    }
  });

  return router;
}
