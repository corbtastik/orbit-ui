// The real transport. Yields the same event shapes as the mock, so the hook
// above it is identical either way.
//
// Reads Server-Sent Events off a fetch response rather than using EventSource,
// because EventSource cannot issue a POST and the conversation has to be sent
// in the body.

export async function* sseTransport({ prompt, provider, signal, history = [], conversationId }) {
  const res = await fetch('/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      provider,
      conversationId,
      // The API is stateless, so the whole conversation goes every time.
      // Only completed turns -- a streaming placeholder has no content yet.
      messages: [
        ...history
          .filter((m) => m.text && !m.streaming)
          .map((m) => ({ role: m.role, text: m.text })),
        { role: 'user', text: prompt },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `chat stream failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Events are separated by a blank line, and a chunk can split one in
      // half -- so keep the tail until its terminator arrives.
      const parts = buffer.split('\n\n');
      buffer = parts.pop() ?? '';

      for (const part of parts) {
        const line = part.split('\n').find((l) => l.startsWith('data:'));
        if (!line) continue;

        let event;
        try {
          event = JSON.parse(line.slice(5).trim());
        } catch {
          continue;
        }

        // Errors arrive as events rather than a status, because the response
        // headers were sent long before anything went wrong.
        if (event.type === 'error') throw new Error(event.message);
        yield event;
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
}
