// A loggable description of a thrown thing.
//
// `err?.message ?? err` looks like it covers everything and does not. Node's
// dual-stack connect tries IPv6 and IPv4 together, and when both fail it
// rejects with an AggregateError whose own `.message` is the empty string --
// the real reasons are in `.errors`. An empty string is not nullish, so `??`
// does not fall through and the log line comes out blank.
//
// That is the worst possible place to lose the message: an endpoint being
// down is the most likely failure there is, and the routers summarise to the
// browser precisely because the log is supposed to carry the full reason. A
// down endpoint and a wrong access key produced the same empty line.

/**
 * @param {unknown} err
 * @returns {string} never empty
 */
export function describeError(err) {
  if (err == null) return "unknown error";
  if (typeof err === "string") return err || "unknown error";

  // AggregateError, and anything else carrying nested causes. Deduplicated:
  // a dual-stack refusal says the same thing twice with a different address,
  // and both halves are worth keeping only when they actually differ.
  const nested = Array.isArray(err.errors) ? err.errors.filter(Boolean) : null;
  if (nested?.length) {
    const parts = [...new Set(nested.map(describeError))];
    return parts.join("; ");
  }

  const message = typeof err.message === "string" ? err.message.trim() : "";
  if (message) {
    // ECONNREFUSED and friends are already in the message when Node builds
    // it, but not when a library writes its own.
    return err.code && !message.includes(err.code) ? `${message} (${err.code})` : message;
  }

  // No message at all: the code is the only thing left that identifies it.
  if (err.code) return String(err.code);

  const stringified = String(err);
  return stringified === "[object Object]" ? "unknown error" : stringified;
}
