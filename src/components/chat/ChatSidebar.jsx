import React, { useState, useMemo } from 'react';
import ProjectGroup from './ProjectGroup.jsx';
import { DEFAULT_PROJECT } from './conversations.js';

// Always present, never created and never deletable. New chats land here when
// no project was chosen, so the sidebar is never a blank panel with nowhere
// obvious to put anything.
const DEFAULT_GROUP = { id: DEFAULT_PROJECT, name: 'default' };

export default function ChatSidebar({
  projects,
  conversations,
  activeId,
  collapsed,
  onToggleCollapsed,
  onSelect,
  onNewChat,
  onCreateProject,
  onDelete,
  onMove,
  width,
}) {
  const [collapsedProjects, setCollapsedProjects] = useState({});
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState('');

  const byProject = useMemo(() => {
    const map = new Map([DEFAULT_GROUP, ...projects].map((p) => [p.id, []]));
    const loose = [];
    // Newest first, so the sidebar answers "what was I just doing".
    const sorted = [...conversations].sort(
      (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
    );
    for (const c of sorted) {
      // A conversation pointing at a project that no longer exists falls back
      // to default rather than vanishing from the list.
      if (map.has(c.projectId)) map.get(c.projectId).push(c);
      else loose.push(c);
    }
    // Anything orphaned joins default rather than forming a second unfiled
    // bucket alongside it.
    if (loose.length) map.get(DEFAULT_PROJECT).push(...loose);
    return { map };
  }, [projects, conversations]);

  const toggleProject = (id) =>
    setCollapsedProjects((prev) => ({ ...prev, [id]: !prev[id] }));

  const submitProject = () => {
    const name = draftName.trim();
    if (name) onCreateProject(name);
    setDraftName('');
    setCreating(false);
  };

  if (collapsed) {
    return (
      <aside className="chat-side chat-side--collapsed">
        <button
          type="button"
          className="chat-side__expand"
          onClick={onToggleCollapsed}
          title="Show chats"
          aria-label="Show chats"
        >
          ☰
        </button>
      </aside>
    );
  }

  return (
    <aside className="chat-side" style={{ flexBasis: `${width}px` }}>
      <div className="chat-side__top">
        <button type="button" className="chat-side__new" onClick={() => onNewChat(null)}>
          + New chat
        </button>
        <button
          type="button"
          className="chat-side__collapse"
          onClick={onToggleCollapsed}
          title="Hide chats"
          aria-label="Hide chats"
        >
          ⟨
        </button>
      </div>

      <div className="chat-side__scroll">
        <div className="chat-side__section-head">
          <span>Chats</span>
          <button
            type="button"
            className="chat-side__section-add"
            onClick={() => setCreating(true)}
            title="New project"
            aria-label="New project"
          >
            +
          </button>
        </div>

        {creating && (
          <input
            className="chat-side__project-input"
            autoFocus
            placeholder="Project name"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={submitProject}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitProject();
              if (e.key === 'Escape') { setDraftName(''); setCreating(false); }
            }}
          />
        )}

        {[DEFAULT_GROUP, ...projects].map((p) => (
          <ProjectGroup
            key={p.id}
            project={p}
            conversations={byProject.map.get(p.id) ?? []}
            isDefault={p.id === DEFAULT_PROJECT}
            collapsed={!!collapsedProjects[p.id]}
            activeId={activeId}
            onToggle={toggleProject}
            onSelect={onSelect}
            onNewChat={onNewChat}
            onDelete={onDelete}
            onMove={onMove}
            projects={projects}
          />
        ))}

      </div>
    </aside>
  );
}
