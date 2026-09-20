import React from 'react';
import Icon from '../brand/Icon.jsx';

// The main view's tabs. Chat is always first and cannot be closed -- it is
// the application, and the browse tabs are things opened alongside it.

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
          <button
            type="button"
            className="tabbar__close"
            onClick={() => onClose(tab.id)}
            title="Close tab"
            aria-label={`Close ${tab.kind === 'collection' ? tab.coll : tab.db}`}
          >
            <Icon name="close" size={18} />
          </button>
        </span>
      ))}
    </div>
  );
}
