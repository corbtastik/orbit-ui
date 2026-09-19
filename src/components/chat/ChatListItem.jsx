import React, { useState } from 'react';
import { relativeTime, DEFAULT_PROJECT } from './conversations.js';
import { providerLabel } from './providers.js';

// The row is a wrapper rather than a single button: a delete control cannot
// be nested inside the select button, and making the whole row a div with a
// click handler would lose keyboard and focus behaviour.
export default function ChatListItem({ conversation, active, onSelect, onDelete, onMove, projects = [] }) {
  const { id, title, updatedAt, provider, projectId } = conversation;
  const [confirming, setConfirming] = useState(false);

  // Two steps rather than one. A mis-click in a list is easy, and a deleted
  // conversation is not recoverable -- but a modal for this is far too heavy.
  const handleDeleteClick = (e) => {
    e.stopPropagation();
    if (confirming) {
      onDelete(id);
    } else {
      setConfirming(true);
    }
  };

  return (
    <div
      className={`chat-side__row ${active ? 'chat-side__row--active' : ''} ${confirming ? 'chat-side__row--confirming' : ''}`}
      onMouseLeave={() => setConfirming(false)}
    >
      <button
        type="button"
        className="chat-side__item"
        onClick={() => onSelect(id)}
        title={`${title} · ${providerLabel(provider)}`}
      >
        <span className={`chat-side__dot chat-msg__provider-dot--${provider}`} />
        <span className="chat-side__item-title">
          {confirming ? 'Delete this chat?' : title}
        </span>
        {!confirming && <span className="chat-side__item-time">{relativeTime(updatedAt)}</span>}
      </button>

      {/* Filing an existing chat. A select rather than a menu: it is compact,
          keyboard-accessible for free, and ViewNavigator already ignores
          SELECT so arrow keys will not also switch views. */}
      {onMove && !confirming && (
        <select
          className="chat-side__move"
          value={projectId ?? DEFAULT_PROJECT}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onMove(id, e.target.value || DEFAULT_PROJECT)}
          title="Move to project"
          aria-label={`Move ${title} to a project`}
        >
          <option value={DEFAULT_PROJECT}>default</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      )}

      <button
        type="button"
        className={`chat-side__delete ${confirming ? 'chat-side__delete--confirm' : ''}`}
        onClick={handleDeleteClick}
        title={confirming ? 'Confirm delete' : 'Delete chat'}
        aria-label={confirming ? `Confirm delete ${title}` : `Delete ${title}`}
      >
        {confirming ? '✓' : '✕'}
      </button>
    </div>
  );
}
