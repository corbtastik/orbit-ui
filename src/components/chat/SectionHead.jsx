import React from 'react';
import Icon from '../brand/Icon.jsx';

// A collapsible sidebar section heading.
//
// Shared rather than written three times, because the sections have to agree:
// a caret that rotates one way in Clusters and the other way in Chats reads as
// two different controls, and that is exactly the kind of drift three
// near-copies produce.
//
// The heading is the toggle. Trailing actions sit beside it rather than inside
// it -- a button nested in a button is invalid, and a click on "new project"
// must not also collapse the section it belongs to.
export default function SectionHead({ label, count, open, onToggle, actions }) {
  return (
    <div className="chat-side__section-head">
      <button
        type="button"
        className="chat-side__section-toggle"
        onClick={onToggle}
        aria-expanded={open}
        title={open ? `Collapse ${label}` : `Expand ${label}`}
      >
        <Icon name="chevron_right" size={18} className={open ? 'icon--rotated' : ''} />
        <span>{label}</span>
        {/* Shown only when collapsed, where it is the one thing still saying
            what is inside. Expanded, the list says it better. */}
        {count != null && !open && <span className="chat-side__section-count">{count}</span>}
      </button>
      {actions}
    </div>
  );
}
