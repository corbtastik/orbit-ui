import React from 'react';
import Icon from '../brand/Icon.jsx';
import { MdIconButton } from '../md/index.jsx';

// The main view's tabs. Chat is always first and cannot be closed -- it is
// the application, and the browse tabs are things opened alongside it.
//
// Hand-built rather than md-tabs, and staying that way. Every tab here
// carries a close control, which md-tabs does not expect: it owns activation
// and treats its tabs as single targets, so an interactive child fights it.
// A close-per-tab is worth more than the component would give back, and this
// is already built to the M3 primary-tab spec -- 48dp, label-large, an inset
// 3dp indicator -- on the same tokens everything else uses.

export default function TabBar({ tabs, activeId, onSelect, onClose }) {
  return (
    <div className="tabbar" role="tablist">
      <button
        type="button"
        role="tab"
        className={`tabbar__tab ${activeId === 'chat' ? 'tabbar__tab--active' : ''}`}
        aria-selected={activeId === 'chat'}
        onClick={() => onSelect('chat')}
      >
        Chat
      </button>

      {tabs.map((tab) => (
        <span
          key={tab.id}
          className={`tabbar__tab ${activeId === tab.id ? 'tabbar__tab--active' : ''}`}
        >
          <button
            type="button"
            role="tab"
            className="tabbar__label"
            aria-selected={activeId === tab.id}
            onClick={() => onSelect(tab.id)}
            title={tab.kind === 'collection' ? `${tab.db}.${tab.coll}` : tab.db}
          >
            <Icon name={tab.kind === 'collection' ? 'folder' : 'database'} size={18} />
            {tab.kind === 'collection' ? tab.coll : tab.db}
          </button>
          <MdIconButton
            className="tabbar__close"
            onClick={() => onClose(tab.id)}
            title="Close tab"
            aria-label={`Close ${tab.kind === 'collection' ? tab.coll : tab.db}`}
          >
            <Icon name="close" size={18} />
          </MdIconButton>
        </span>
      ))}
    </div>
  );
}
