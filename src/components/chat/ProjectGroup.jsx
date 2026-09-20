import React from 'react';
import ChatListItem from './ChatListItem.jsx';
import Icon from '../brand/Icon.jsx';
import { MdIconButton } from '../md/index.jsx';

export default function ProjectGroup({
  project,
  conversations,
  collapsed,
  activeId,
  onToggle,
  onSelect,
  onNewChat,
  onDelete,
  onMove,
  projects,
  isDefault,
}) {
  return (
    <section className={`chat-side__group ${isDefault ? 'chat-side__group--default' : ''}`}>
      <div className="chat-side__group-header">
        <button
          type="button"
          className="chat-side__group-toggle"
          onClick={() => onToggle(project.id)}
          aria-expanded={!collapsed}
        >
          <Icon name="chevron_right" size={20} className={collapsed ? '' : 'icon--rotated'} />
          <span className="chat-side__group-name">{project.name}</span>
          <span className="chat-side__group-count">{conversations.length}</span>
        </button>
        {/* Starting a chat from inside a project is how conversations get
            filed. Without it, every chat lands loose and the projects stay
            empty. */}
        <MdIconButton
          className="chat-side__group-add"
          onClick={() => onNewChat(project.id)}
          title={`New chat in ${project.name}`}
          aria-label={`New chat in ${project.name}`}
        >
          <Icon name="add" size={20} />
        </MdIconButton>
      </div>

      {!collapsed && (
        <div className="chat-side__items">
          {conversations.length === 0 ? (
            <p className="chat-side__empty-group">No chats yet</p>
          ) : (
            conversations.map((c) => (
              <ChatListItem
                key={c.id}
                conversation={c}
                active={c.id === activeId}
                onSelect={onSelect}
                onDelete={onDelete}
                onMove={onMove}
                projects={projects}
              />
            ))
          )}
        </div>
      )}
    </section>
  );
}
