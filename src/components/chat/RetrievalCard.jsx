import React, { useState } from 'react';
import Icon from '../brand/Icon.jsx';

// Deliberately reuses the pipeline vocabulary from the Search Explorer view.
// The same idea should not have two visual languages in one application.
export default function RetrievalCard({ retrieval }) {
  const [open, setOpen] = useState(false);
  const { tool, mode, index, query, count } = retrieval;

  return (
    <div className={`chat-retrieval ${open ? 'chat-retrieval--open' : ''}`}>
      <button
        type="button"
        className="chat-retrieval__summary"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <Icon name="chevron_right" size={18} className={open ? 'icon--rotated' : ''} />
        <span className="chat-retrieval__tool">{tool}</span>
        <span className="chat-retrieval__sep">·</span>
        <span className="chat-retrieval__mode">{mode}</span>
        <span className="chat-retrieval__sep">·</span>
        {/* Search transports report a hit count; a tool call has no such
            number, so the label falls back to the mode rather than showing
            "null hits". */}
        <span className="chat-retrieval__count">
          {count == null ? mode : `${count} hits`}
        </span>
      </button>

      {open && (
        <div className="chat-retrieval__detail">
          <div className="pipeline-step">
            <div className="pipeline-step__content">
              <div className="pipeline-step__title">Query</div>
              <div className="pipeline-step__value">{query}</div>
            </div>
          </div>
          <div className="pipeline-arrow"><Icon name="arrow_forward" size={18} /></div>
          <div className="pipeline-step">
            <div className="pipeline-step__content">
              <div className="pipeline-step__title">Index</div>
              <div className="pipeline-step__value pipeline-step__value--small">{index}</div>
            </div>
          </div>
          {count != null && <div className="pipeline-arrow"><Icon name="arrow_forward" size={18} /></div>}
          {count != null && (
            <div className="pipeline-step">
              <div className="pipeline-step__content">
                <div className="pipeline-step__title">Results</div>
                <div className="pipeline-step__value">{count}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
