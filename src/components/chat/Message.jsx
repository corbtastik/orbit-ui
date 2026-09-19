import React, { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import RetrievalCard from './RetrievalCard.jsx';
import { providerLabel } from './providers.js';

// Memoised on the text alone: the parser runs on every render, and during a
// stream that is once per token. Without this a long answer visibly janks as
// it arrives.
//
// remark-gfm is what makes pipe tables work -- the model emits them constantly
// and without it they render as literal rows of pipes.
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
      }}
    >
      {text}
    </ReactMarkdown>
  );
});

export default function Message({ message }) {
  const { role, text, retrieval, streaming, provider, model, stopped, failed } = message;

  if (role === 'user') {
    return (
      <div className="chat-msg chat-msg--user">
        <div className="chat-msg__bubble">{text}</div>
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

      {/* Retrieval renders above the prose on purpose: seeing the lookup
          happen first is what distinguishes this from a chat box that
          guesses. */}
      {retrieval && <RetrievalCard retrieval={retrieval} />}

      <div className="chat-msg__text chat-md">
        <Markdown text={text} />
        {streaming && <span className="chat-msg__caret" aria-hidden="true" />}
        {stopped && <span className="chat-msg__note">stopped</span>}
        {failed && <span className="chat-msg__note chat-msg__note--failed">incomplete</span>}
      </div>

    </div>
  );
}
