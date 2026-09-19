import { useState, useRef, useCallback } from 'react';
import { mockTransport } from '../components/chat/transports/mock.js';
import { sseTransport } from '../components/chat/transports/sse.js';

// OrbitAI is the only provider offered, so it is the only mapping here.
//
// The mock fallback is kept deliberately: it is the only way to work on the
// chat UI without burning tokens or needing the MCP server running, and the
// only way to reach the /error, /stall and /empty states on demand. Passing
// an unmapped provider id routes to it.
const TRANSPORTS = { orbit: sseTransport };
const transportFor = (provider) => TRANSPORTS[provider] ?? mockTransport;

let seq = 0;
const nextId = () => `m-${Date.now().toString(36)}-${seq++}`;

/**
 * The seam. Everything above this hook is provider-agnostic; this is the only
 * file that knows how a reply arrives.
 *
 * Swapping the mock for a real transport is a one-line change here, because
 * both yield the same event shapes.
 */
export function useChatStream({ provider, transport, conversationId, initialMessages = [] }) {
  const [messages, setMessages] = useState(initialMessages);
  const [isStreaming, setStreaming] = useState(false);
  const [error, setError] = useState(null);
  // A real answer takes 45-90 seconds across 20+ tool rounds. Without this the
  // UI shows a bare caret the whole time, and a working run is indistinguishable
  // from a dead one -- which is exactly how this went undiagnosed.
  const [activity, setActivity] = useState(null);
  const abortRef = useRef(null);

  const patchLast = useCallback((patch) => {
    setMessages((prev) => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      const last = next[next.length - 1];
      next[next.length - 1] = typeof patch === 'function' ? patch(last) : { ...last, ...patch };
      return next;
    });
  }, []);

  // conversationIdOverride exists because the caller often knows the id
  // before React does. A conversation created moments earlier is not yet in
  // this closure's `conversationId` -- state updates are not synchronous --
  // and sending without it puts the first message of every new chat into the
  // shared "default" MCP session.
  const send = useCallback(async (text, conversationIdOverride) => {
    // Always resolves to a pair. Returning undefined here made the caller's
    // `const { user, assistant } = await send(...)` throw a TypeError, which
    // silently killed the submit with no request and nothing on screen.
    if (isStreaming) return { user: null, assistant: null, skipped: true };
    setError(null);

    // Both turns are appended before the transport is touched. Waiting for the
    // server to confirm before showing what the user typed makes the UI feel
    // broken on a slow connection, and the placeholder is what the retrieval
    // card and the streaming caret attach to.
    const userTurn = { id: nextId(), role: 'user', text };
    const assistantTurn = {
      id: nextId(),
      role: 'assistant',
      provider,
      text: '',
      streaming: true,
    };
    // Captured before the new turns are appended: the provider needs the
    // conversation as it was, not including the empty placeholder.
    const history = messages;

    setMessages((prev) => [...prev, userTurn, assistantTurn]);
    setStreaming(true);
    setActivity({ label: 'thinking', startedAt: Date.now(), calls: 0 });

    const controller = new AbortController();
    abortRef.current = controller;

    // Accumulated locally as well as in state: the caller needs the finished
    // turns to persist them, and reading them back out of state after an
    // await would see whatever the closure captured, not the final value.
    let assistant = { ...assistantTurn };
    const track = (patch) => {
      assistant = typeof patch === 'function' ? patch(assistant) : { ...assistant, ...patch };
      patchLast(patch);
    };

    try {
      const run = transport ?? transportFor(provider);
      for await (const event of run({
        prompt: text,
        provider,
        history,
        conversationId: conversationIdOverride ?? conversationId,
        signal: controller.signal,
      })) {
        switch (event.type) {
          case 'retrieval':
            track({ retrieval: event.retrieval });
            setActivity((a) => ({
              label: event.retrieval?.tool ?? 'working',
              startedAt: a?.startedAt ?? Date.now(),
              calls: (a?.calls ?? 0) + 1,
            }));
            break;
          case 'token':
            // First token means the model is answering rather than searching.
            setActivity((a) => (a && a.label !== 'answering'
              ? { ...a, label: 'answering' } : a));
            // Appended rather than replaced, so React re-renders one growing
            // string instead of rebuilding the turn on every token.
            track((last) => ({ ...last, text: last.text + event.text }));
            break;
          case 'done':
            track({ streaming: false, model: event.model });
            break;
          default:
            break;
        }
      }
    } catch (err) {
      if (err?.name === 'AbortError') {
        // Stopping is a choice, not a failure. The partial answer stays.
        track({ streaming: false, stopped: true });
      } else {
        setError(err?.message ?? 'something went wrong');
        track({ streaming: false, failed: true });
      }
    } finally {
      setStreaming(false);
      setActivity(null);
      abortRef.current = null;
    }

    return { user: userTurn, assistant };
  }, [isStreaming, provider, transport, patchLast, messages, conversationId]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const reset = useCallback((next = []) => {
    abortRef.current?.abort();
    setMessages(next);
    setError(null);
  }, []);

  return { messages, isStreaming, error, activity, send, stop, reset };
}
