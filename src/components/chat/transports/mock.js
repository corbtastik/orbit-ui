// A fake transport, so the whole chat UI can be finished before any provider
// exists.
//
// It is not only a stand-in. The states worth designing for -- a stream that
// stalls, one that dies halfway, a search that finds nothing -- are painful to
// trigger against a live model and embarrassing to discover on stage. Here
// they are one prompt away:
//
//   /error   fail mid-stream
//   /stall   emit nothing and hang until stopped
//   /empty   retrieve zero results
//   /slow    emit tokens at a crawl
//
// The contract is an async generator of events. A real transport reading SSE
// from the server yields the same shapes, so the hook above it never changes.

const TOKEN_MS = 18;

// One reply. The mock exists to exercise UI states, not to impersonate
// several vendors.
const REPLY =
  'The cluster has four databases. `analytics` is the largest at 41.2 GB ' +
  'across nine collections, and `events` is the busiest - it takes roughly ' +
  'nine tenths of the writes. Two collections in `analytics` have no index ' +
  'beyond `_id`, which is worth a look before the next growth step.';

const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    const id = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(id);
      reject(new DOMException('aborted', 'AbortError'));
    }, { once: true });
  });

// Split so whitespace rides along with the word before it -- otherwise the
// rendered text reflows on every token and the whole paragraph jitters.
function tokenise(text) {
  return text.match(/\S+\s*/g) ?? [];
}

export async function* mockTransport({ prompt, provider, signal }) {
  const directive = (prompt.match(/\/(error|stall|empty|slow)\b/) ?? [])[1];
  const tokenMs = directive === 'slow' ? 140 : TOKEN_MS;

  if (directive === 'stall') {
    // Never resolves. Only `stop` ends this, which is the point.
    await sleep(10 * 60 * 1000, signal);
    return;
  }

  await sleep(420, signal);

  const count = directive === 'empty' ? 0 : 12;
  yield {
    type: 'retrieval',
    retrieval: {
      tool: 'list-databases',
      mode: 'mcp',
      index: 'http://127.0.0.1:3600/mcp',
      query: prompt.replace(/\/\w+/g, '').trim().slice(0, 60),
      count,
    },
  };

  if (count === 0) {
    await sleep(300, signal);
    yield { type: 'token', text: 'That query came back empty. ' };
    yield { type: 'token', text: 'Check the namespace, or ask me what is there.' };
    yield { type: 'done', model: `${provider}-1` };
    return;
  }

  await sleep(260, signal);

  const tokens = tokenise(REPLY);
  for (let i = 0; i < tokens.length; i++) {
    if (directive === 'error' && i === Math.floor(tokens.length / 3)) {
      throw new Error('the model stopped responding partway through');
    }
    await sleep(tokenMs, signal);
    yield { type: 'token', text: tokens[i] };
  }

  yield { type: 'done', model: `${provider}-1` };
}
