import crypto from "node:crypto";

// AWS Signature Version 4, for the four read calls the object browser makes.
//
// Hand-rolled rather than pulled from @aws-sdk/client-s3. That package brings
// roughly forty transitive dependencies to sign a GET, and this app reads S3
// four ways and writes it none. The signing itself is a hash chain and a
// canonical string; what makes SigV4 fiddly is the breadth of what it must
// cover -- streaming bodies, chunked uploads, presigned URLs, STS -- and none
// of that is in play here.
//
// Empty-payload reads only -- GET and HEAD. Anything with a body would need
// the payload hash computed over it rather than the constant below, and if
// that is ever needed it should be a deliberate change here rather than a
// surprise at a call site.

const ALGORITHM = "AWS4-HMAC-SHA256";

/** The SHA-256 of "", which every request here sends as its payload hash. */
const EMPTY_PAYLOAD_SHA256 = crypto.createHash("sha256").update("").digest("hex");

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const hmac = (key, value) => crypto.createHmac("sha256", key).update(value).digest();

/**
 * Each path segment is encoded, but the separators are not -- S3's canonical
 * URI keeps "/" literal while everything else in a key is percent-encoded.
 * encodeURIComponent leaves !'()* alone, which S3 expects encoded.
 */
export function encodeKey(key) {
  return String(key)
    .split("/")
    .map((segment) =>
      encodeURIComponent(segment).replace(
        /[!'()*]/g,
        (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
      )
    )
    .join("/");
}

/**
 * The query string in canonical form: sorted by key, each side encoded.
 *
 * Empty values are dropped rather than rendered as "key=". That is right for
 * every parameter here -- an empty continuation token or prefix must not go on
 * the wire -- but it means this cannot canonicalise a flag-style parameter
 * like "?lifecycle", which S3 signs as "lifecycle=". No caller needs one; a
 * caller that does must build its query string itself.
 *
 * S3 rejects a signature computed over differently-ordered parameters, so the
 * sort is part of the protocol rather than tidiness. Continuation tokens make
 * this matter -- they are opaque base64 containing characters that must be
 * encoded identically here and on the wire.
 */
export function canonicalQuery(params = {}) {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => [encodeURIComponent(k), encodeURIComponent(String(v))])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
}

/**
 * Headers signing one read.
 *
 * The method is part of the canonical request, so HEAD and GET sign
 * differently -- signing a HEAD as a GET fails as a signature mismatch, which
 * reads like a credentials problem and is not one.
 *
 * `host` must be signed and must match what actually goes on the wire,
 * including the port when it is non-default, for the same reason.
 */
export function signRead({
  method = "GET", accessKey, secretKey, region, host, path, query = "", now = new Date(),
}) {
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = amzDate.slice(0, 8);

  const canonicalHeaders =
    `host:${host}\n` +
    `x-amz-content-sha256:${EMPTY_PAYLOAD_SHA256}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";

  const canonicalRequest = [
    method,
    path,
    query,
    canonicalHeaders,
    signedHeaders,
    EMPTY_PAYLOAD_SHA256,
  ].join("\n");

  const scope = `${date}/${region}/s3/aws4_request`;
  const toSign = [ALGORITHM, amzDate, scope, sha256(canonicalRequest)].join("\n");

  let key = hmac(`AWS4${secretKey}`, date);
  for (const part of [region, "s3", "aws4_request"]) key = hmac(key, part);
  const signature = crypto.createHmac("sha256", key).update(toSign).digest("hex");

  return {
    authorization:
      `${ALGORITHM} Credential=${accessKey}/${scope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`,
    "x-amz-date": amzDate,
    "x-amz-content-sha256": EMPTY_PAYLOAD_SHA256,
  };
}
