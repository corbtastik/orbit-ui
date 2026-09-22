import https from "node:https";
import http from "node:http";
import { log } from "../lib/log.js";
import { signRead, canonicalQuery, encodeKey } from "./sigv4.js";

// The object stores the sidebar browses: S3-compatible endpoints, MinIO and
// AIStor among them.
//
// The same contract as server/clusters/registry.js, and deliberately so: read
// only, configured from the environment at boot, and credentials that never
// reach the browser. Every call here is a GET -- ListBuckets, ListObjectsV2
// and HeadObject. There is no PUT, POST or DELETE, and one should not be
// added: these views are a window, and the tools are how the app changes
// anything.
//
// Configured in .env as numbered groups:
//
//   ORBIT_OBJECT_1_ENDPOINT=https://localhost:9000
//   ORBIT_OBJECT_1_KEY=...
//   ORBIT_OBJECT_1_SECRET=...
//   ORBIT_OBJECT_1_NAME=localdev        (optional; the host stands in)
//   ORBIT_OBJECT_1_REGION=us-east-1     (optional)
//   ORBIT_OBJECT_1_INSECURE=true        (optional; see below)
//
// INSECURE accepts a self-signed certificate, which a local MinIO generates
// for itself. It is per endpoint on purpose. The global alternative,
// NODE_TLS_REJECT_UNAUTHORIZED=0, would also silently stop verifying the
// Atlas and MCP connections this process makes -- one dev convenience quietly
// weakening two unrelated things.

/** id -> { id, name, endpoint, accessKey, secretKey, region, insecure, agent }. */
const stores = new Map();

// https://localhost:9000 -> localhost, https://s3.us-east-1.amazonaws.com -> s3
const hostLabel = (endpoint) => {
  try {
    return new URL(endpoint).hostname.split(".")[0] || "storage";
  } catch {
    return "storage";
  }
};

/**
 * Reads the environment once, at boot -- the same rule the cluster registry
 * follows, and for the same reason: a connection string appearing in .env
 * later is a restart, which is how every other setting here behaves.
 */
export function loadStores(env = process.env) {
  const indices = new Set();
  for (const key of Object.keys(env)) {
    const m = /^ORBIT_OBJECT_(\d+)_ENDPOINT$/.exec(key);
    if (m && env[key]) indices.add(Number(m[1]));
  }

  for (const i of [...indices].sort((a, b) => a - b)) {
    const endpoint = env[`ORBIT_OBJECT_${i}_ENDPOINT`].replace(/\/+$/, "");
    const accessKey = env[`ORBIT_OBJECT_${i}_KEY`];
    const secretKey = env[`ORBIT_OBJECT_${i}_SECRET`];

    // A half-configured endpoint is skipped loudly rather than registered and
    // failing on every expand with something that reads like a server fault.
    if (!accessKey || !secretKey) {
      log(`[storage] ORBIT_OBJECT_${i} has no KEY/SECRET; skipping`);
      continue;
    }

    const insecure = /^(1|true|yes)$/i.test(env[`ORBIT_OBJECT_${i}_INSECURE`] ?? "");
    stores.set(`s${i}`, {
      id: `s${i}`,
      name: env[`ORBIT_OBJECT_${i}_NAME`] || hostLabel(endpoint),
      endpoint,
      accessKey,
      secretKey,
      region: env[`ORBIT_OBJECT_${i}_REGION`] || "us-east-1",
      insecure,
      agent: null,
    });
    if (insecure) log(`[storage] s${i} accepts a self-signed certificate`);
  }

  log(`object stores configured: ${stores.size || "none"}`);
  return listConfigured();
}

/** Never includes keys. Credentials have no business reaching the browser. */
export const listConfigured = () =>
  [...stores.values()].map(({ id, name, endpoint }) => ({ id, name, endpoint }));

// Kept per store and reused. A fresh TLS handshake on every expand would make
// each click in the tree wait on one, the same reasoning as the Mongo client
// being connected lazily and then held.
function agentFor(store) {
  if (store.agent) return store.agent;
  const isTls = store.endpoint.startsWith("https:");
  store.agent = isTls
    ? new https.Agent({ keepAlive: true, rejectUnauthorized: !store.insecure })
    : new http.Agent({ keepAlive: true });
  return store.agent;
}

/** One signed read. HEAD resolves with headers only and no body. */
function send(store, method, path, params = {}) {
  const url = new URL(store.endpoint);
  const query = canonicalQuery(params);
  // The signed host must match what goes on the wire, port included.
  const host = url.port ? `${url.hostname}:${url.port}` : url.hostname;

  const signed = signRead({
    method,
    accessKey: store.accessKey,
    secretKey: store.secretKey,
    region: store.region,
    host,
    path,
    query,
  });

  const transport = url.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const req = transport.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: query ? `${path}?${query}` : path,
        method,
        agent: agentFor(store),
        headers: {
          host,
          Authorization: signed.authorization,
          "x-amz-date": signed["x-amz-date"],
          "x-amz-content-sha256": signed["x-amz-content-sha256"],
        },
        // An unreachable endpoint should render as an error in the tree within
        // a couple of seconds, not hang the sidebar on a socket timeout.
        timeout: 8000,
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          if (res.statusCode >= 400) {
            // S3 errors are XML with a machine-readable code; it is far more
            // useful than the status on its own.
            const code = /<Code>([^<]+)<\/Code>/.exec(body)?.[1];
            return reject(new Error(code ? `${code} (${res.statusCode})` : `HTTP ${res.statusCode}`));
          }
          resolve({ body, headers: res.headers });
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("timed out")));
    req.on("error", reject);
    req.end();
  });
}

// Deliberately small rather than a dependency. S3 list responses are a flat
// sequence of same-shaped elements, which is the one XML shape a regex reads
// safely -- no nesting to lose track of and no attributes to parse.
const tagValue = (xml, tag) => {
  const m = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(xml);
  return m ? decodeXml(m[1]) : null;
};

const blocks = (xml, tag) =>
  [...xml.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g"))].map((m) => m[1]);

// Keys legitimately contain & and <, and S3 escapes them on the way out.
// Numeric entities are not optional to handle: MinIO returns an ETag's
// surrounding quotes as &#34; rather than &quot;, so without this the quotes
// survive the strip below and every ETag renders with them still attached.
function decodeXml(s) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    // Last, or an escaped "&amp;lt;" would decode twice.
    .replace(/&amp;/g, "&");
}

/** ListBuckets XML -> rows. Exported for testing; see storage.test.js. */
export function parseListBuckets(xml) {
  return blocks(xml, "Bucket")
    .map((b) => ({
      name: tagValue(b, "Name"),
      createdAt: tagValue(b, "CreationDate"),
    }))
    .filter((b) => b.name)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function listBuckets(id) {
  const store = stores.get(id);
  if (!store) return null;

  const { body } = await send(store, "GET", "/");
  return parseListBuckets(body);
}

/** Hard ceiling on a page, so a crafted limit cannot ask for a whole bucket. */
const MAX_KEYS = 100;

/**
 * One page of a bucket.
 *
 * Paging here is forward-only, which is the one place this genuinely differs
 * from the document views. S3 returns an opaque continuation token rather than
 * an offset: there is no way to ask for "page 5" without having walked pages 1
 * to 4, and no total count without listing everything. The caller passes the
 * token back to move forward, and the UI says so rather than showing page
 * numbers it cannot honour.
 *
 * Listing is delimited by "/", so a bucket with prefixes browses as folders
 * rather than as one flat list of every key beneath them.
 */
export async function listObjects(id, bucket, { prefix = "", token = "", limit = 50 } = {}) {
  const store = stores.get(id);
  if (!store) return null;

  const size = Math.min(Math.max(1, limit), MAX_KEYS);
  const { body } = await send(store, "GET", `/${encodeKey(bucket)}`, {
    "list-type": 2,
    delimiter: "/",
    prefix,
    "max-keys": size,
    "continuation-token": token,
  });

  return { ...parseListObjects(body, prefix), bucket, limit: size };
}

/** ListObjectsV2 XML -> one page. Exported for testing; see storage.test.js. */
export function parseListObjects(xml, prefix = "") {
  // CommonPrefixes are the folders at this level; Contents are the objects.
  const prefixes = blocks(xml, "CommonPrefixes")
    .map((p) => tagValue(p, "Prefix"))
    .filter(Boolean);

  const objects = blocks(xml, "Contents")
    .map((c) => ({
      key: tagValue(c, "Key"),
      size: Number(tagValue(c, "Size") ?? 0),
      lastModified: tagValue(c, "LastModified"),
      etag: (tagValue(c, "ETag") ?? "").replace(/"/g, ""),
      storageClass: tagValue(c, "StorageClass"),
    }))
    // A prefix is returned as a zero-byte key of its own; it is already in
    // prefixes, and listing it twice reads as a duplicate row.
    .filter((o) => o.key && o.key !== prefix);

  return {
    prefix,
    prefixes,
    objects,
    // "true" as text: this is XML, not JSON.
    truncated: tagValue(xml, "IsTruncated") === "true",
    nextToken: tagValue(xml, "NextContinuationToken"),
  };
}

/**
 * Metadata for one object.
 *
 * HEAD, emphatically not GET. A GET here would pull the whole object through
 * this process to read four headers off it, and this bucket set holds 43MB
 * files -- the metadata row under a video would download the video.
 */
export async function statObject(id, bucket, key) {
  const store = stores.get(id);
  if (!store) return null;

  const { headers } = await send(store, "HEAD", `/${encodeKey(bucket)}/${encodeKey(key)}`);
  return {
    key,
    size: Number(headers["content-length"] ?? 0),
    contentType: headers["content-type"] ?? null,
    lastModified: headers["last-modified"] ?? null,
    etag: (headers.etag ?? "").replace(/"/g, ""),
  };
}
