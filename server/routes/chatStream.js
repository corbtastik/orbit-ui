import express from "express";
import { getProvider, listProviders } from "../providers/index.js";
import { log } from "../lib/log.js";

// Server-Sent Events rather than WebSockets: this is one-directional, it is a
// plain HTTP response so the existing Vite proxy carries it unchanged, and
// there is no connection lifecycle to manage.
function openStream(res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    // Without this, a proxy in front of the app may buffer the whole response
    // and deliver it at once -- which looks exactly like a hang.
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();
}

const sse = (res, event) => res.write(`data: ${JSON.stringify(event)}\n\n`);

export default function makeChatStreamRouter() {
  const router = express.Router();

  // Lets the UI show which providers are actually usable rather than offering
  // four and failing on three.
  router.get("/chat/providers", async (_req, res) => {
    res.json({ providers: await listProviders() });
  });

  router.post("/chat/stream", async (req, res) => {
    const providerId = req.body?.provider;
    const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    // Identifies the MCP session. Tool calls for one conversation must all
    // land in the same session, and two conversations must not share one.
    const conversationId = req.body?.conversationId ?? "default";

    const provider = getProvider(providerId);
    if (!provider) {
      return res.status(400).json({ error: `unknown provider: ${providerId}` });
    }
    if (!provider.isConfigured()) {
      return res.status(503).json({ error: `${providerId} is not configured on the server` });
    }
    if (messages.length === 0) {
      return res.status(400).json({ error: "messages are required" });
    }

    // Stopping in the browser closes the connection; that has to reach the
    // provider or generation continues and is billed with nobody reading it.
    // Abort on RESPONSE close, not request close.
    //
    // req 'close' fires when the request *body stream* finishes, which
    // express.json() triggers milliseconds after the handler starts. Wiring
    // the abort to it cancels the model call before it begins, and the
    // resulting AbortError looks exactly like a client that hung up -- so the
    // stream ends silently with no tokens and no error.
    //
    // res 'close' also fires on normal completion, hence the writableEnded
    // guard: only a socket that closed before we finished is a real
    // disconnect worth cancelling generation for.
    const controller = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) {
        log(`[${conversationId}] client disconnected -> aborting generation`);
        controller.abort();
      }
    });

    openStream(res);

    try {
      for await (const event of provider.streamChat({
        messages,
        conversationId,
        signal: controller.signal,
      })) {
        if (res.writableEnded) break;
        sse(res, event);
      }
    } catch (err) {
      if (err?.name === "AbortError" || controller.signal.aborted) {
        // The client hung up. Nothing to report to a socket that is gone.
      } else {
        console.error("[chat/stream]", err?.message ?? err);
        // Headers are already sent, so an error cannot be an HTTP status --
        // it has to travel as an event the client knows how to render.
        sse(res, { type: "error", message: err?.message ?? "the model stopped responding" });
      }
    } finally {
      if (!res.writableEnded) res.end();
    }
  });

  return router;
}
