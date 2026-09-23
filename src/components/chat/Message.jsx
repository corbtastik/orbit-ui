import React, { memo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import RetrievalCard from './RetrievalCard.jsx';
import CopyButton from './CopyButton.jsx';
import Icon from '../brand/Icon.jsx';
import { providerLabel } from './providers.js';

// Memoised on the text alone: the parser runs on every render, and during a
// stream that is once per token. Without this a long answer visibly janks as
// it arrives.
//
// remark-gfm is what makes pipe tables work -- the model emits them constantly
// and without it they render as literal rows of pipes.
/**
 * The source text of a fenced block.
 *
 * Taken from the mdast node rather than from the rendered children: children
 * are React elements by this point, and walking them back to a string loses
 * newlines, which is most of what makes a pipeline worth copying.
 */
function codeTextOf(node) {
  const code = node?.children?.find((c) => c.tagName === 'code') ?? node;
  const text = code?.children?.find((c) => c.type === 'text');
  return text?.value ?? '';
}

const Markdown = memo(function Markdown({ text }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // Tables are wider than the 780px column more often than not.
        table: ({ node, ...props }) => (
          <div className="chat-md__table-wrap"><table {...props} /></div>
        ),
        // Links from a model should not navigate away silently.
        a: ({ node, ...props }) => (
          <a {...props} target="_blank" rel="noreferrer noopener" />
        ),
        // A fenced block is usually a pipeline or a shell command meant to be
        // run somewhere else, and selecting one by hand across a scrolling
        // transcript is the worst way to get it there.
        pre: ({ node, children, ...props }) => (
          <div className="chat-md__pre-wrap">
            <pre {...props}>{children}</pre>
            <CopyButton
              className="chat-md__pre-copy"
              text={codeTextOf(node)}
              label="Copy code"
              size={16}
            />
          </div>
        ),
      }}
    >
      {text}
    </ReactMarkdown>
  );
});

/** How many calls show before the list folds itself away. */
const CALLS_SHOWN = 2;

function RetrievalList({ calls, failedCalls }) {
  const [expanded, setExpanded] = useState(false);
  const folds = calls.length > CALLS_SHOWN;
  const shown = expanded || !folds ? calls : calls.slice(0, CALLS_SHOWN);

  return (
    <div className="chat-msg__calls">
      {shown.map((c, i) => (
        // Keyed by the tool_use id, which is stable; falling back to position
        // for transcripts stored before ids travelled with a call.
        <RetrievalCard key={c.id ?? i} retrieval={c} />
      ))}

      {folds && (
        <button
          type="button"
          className="chat-msg__calls-toggle"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          <Icon name={expanded ? 'expand_less' : 'expand_more'} size={16} />
          {expanded
            ? 'Show fewer'
            : `${calls.length - CALLS_SHOWN} more tool call${calls.length - CALLS_SHOWN === 1 ? '' : 's'}`}
          {failedCalls > 0 && (
            <span className="chat-msg__calls-failed">
              {failedCalls} failed
            </span>
          )}
        </button>
      )}
    </div>
  );
}

export default function Message({ message }) {
  const {
    role, text, retrievals, retrieval, streaming, provider, model, stopped, failed,
  } = message;

  // `retrieval` is the single-call shape conversations were stored in before
  // the transcript kept all of them. Old transcripts still render, with the
  // one call they managed to keep.
  const calls = retrievals ?? (retrieval ? [retrieval] : []);
  const failedCalls = calls.filter((c) => c.result?.isError).length;

  if (role === 'user') {
    return (
      <div className="chat-msg chat-msg--user">
        <div className="chat-msg__bubble">{text}</div>
        {/* A prompt worth having again is usually a long one -- a question
            with a cluster, a database and three conditions in it. Selecting
            that by hand out of a scrolling transcript is the worst way to get
            it back, which is the same reason the code blocks and the replies
            carry one. */}
        {text && (
          <div className="chat-msg__actions chat-msg__actions--user">
            <CopyButton text={text} label="Copy prompt" size={16} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="chat-msg chat-msg--assistant">
      {/* Which model answered has to survive scrollback. Switching provider
          keeps the transcript, so a conversation can hold answers from
          several -- and comparing them is half the point. */}
      {provider && (
        <div className="chat-msg__provider">
          <span className={`chat-msg__provider-dot chat-msg__provider-dot--${provider}`} />
          {providerLabel(provider)}
          {model && <span className="chat-msg__model">{model}</span>}
        </div>
      )}

      {/* Tool calls render above the prose on purpose: seeing the lookup
          happen first is what distinguishes this from a chat box that
          guesses. Collapsed by default past a couple of calls -- a real
          answer runs twenty rounds, and twenty cards would bury the answer
          they were gathered for. */}
      {calls.length > 0 && <RetrievalList calls={calls} failedCalls={failedCalls} />}

      <div className="chat-msg__text chat-md">
        <Markdown text={text} />
        {streaming && <span className="chat-msg__caret" aria-hidden="true" />}
        {stopped && <span className="chat-msg__note">stopped</span>}
        {failed && <span className="chat-msg__note chat-msg__note--failed">incomplete</span>}
      </div>

      {/* Copying a finished answer, which is routinely a table or a pipeline
          meant to be run elsewhere. Hidden while streaming: half an answer is
          not what anyone means to copy. */}
      {!streaming && text && (
        <div className="chat-msg__actions">
          <CopyButton text={text} label="Copy reply" />
        </div>
      )}

    </div>
  );
}
