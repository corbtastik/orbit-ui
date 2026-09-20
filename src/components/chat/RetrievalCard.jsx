import React, { useState } from 'react';
import Icon from '../brand/Icon.jsx';
import CopyButton from './CopyButton.jsx';

// One tool call: what was asked, what came back, how long it took.
//
// The arguments used to be a 200-character fragment and the result was never
// sent to the browser at all, which left this able to say that a tool ran but
// not what it did. Both are here in full now -- the result up to the server's
// cap, which says so when it bites.

const pretty = (value) => {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

/** Tool results are usually JSON; show them formatted when they are. */
function formatResult(text) {
  if (typeof text !== 'string') return String(text ?? '');
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return text;
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    // A clipped result is no longer valid JSON. Showing it raw is right --
    // pretending it parsed would hide that it was cut off.
    return text;
  }
}

export default function RetrievalCard({ retrieval }) {
  const [open, setOpen] = useState(false);
  const { tool, input, result, round } = retrieval;

  const pending = !result;
  const failed = result?.isError;
  const args = pretty(input ?? {});

  const classes = [
    'chat-retrieval',
    open ? 'chat-retrieval--open' : '',
    failed ? 'chat-retrieval--failed' : '',
  ].join(' ');

  return (
    <div className={classes}>
      <button
        type="button"
        className="chat-retrieval__summary"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <Icon name="chevron_right" size={18} className={open ? 'icon--rotated' : ''} />
        <span className="chat-retrieval__tool">{tool}</span>

        {/* The round is what makes a list of twenty calls readable: calls
            sharing a round ran in parallel. */}
        {round != null && <span className="chat-retrieval__round">#{round}</span>}

        <span className="chat-retrieval__spacer" />

        {pending && <span className="chat-retrieval__state">running…</span>}
        {failed && (
          <span className="chat-retrieval__state chat-retrieval__state--error">
            <Icon name="error" size={14} />
            failed
          </span>
        )}
        {result && !failed && <span className="chat-retrieval__state">{result.ms}ms</span>}
      </button>

      {open && (
        <div className="chat-retrieval__detail">
          <div className="chat-retrieval__pane">
            <div className="chat-retrieval__pane-head">
              <span>Arguments</span>
              <CopyButton text={args} label="Copy arguments" size={16} />
            </div>
            <pre className="chat-retrieval__code">{args}</pre>
          </div>

          <div className="chat-retrieval__pane">
            <div className="chat-retrieval__pane-head">
              <span>{failed ? 'Error' : 'Result'}</span>
              {result && <CopyButton text={result.text} label="Copy result" size={16} />}
            </div>
            {pending ? (
              <p className="chat-retrieval__note">Waiting for the tool to return…</p>
            ) : (
              <>
                <pre className="chat-retrieval__code">{formatResult(result.text)}</pre>
                {result.truncated && (
                  <p className="chat-retrieval__note">
                    Clipped at {result.text.length.toLocaleString()} of{' '}
                    {result.fullLength?.toLocaleString()} characters — the whole result is
                    in <code>logs/orbit.log</code>.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
