import React, { useState, useMemo, useRef } from 'react';
import ProjectGroup from './ProjectGroup.jsx';
import ClusterTree from './ClusterTree.jsx';
import ChatSearch, { isSearching } from './ChatSearch.jsx';
import SectionHead from './SectionHead.jsx';
import SectionResizer, { SPLIT_DEFAULT, clampSplit } from './SectionResizer.jsx';
import { useCollapsedSections } from '../../hooks/useCollapsedSections.js';
import ChatListItem from './ChatListItem.jsx';
import OrbitLogo from '../brand/OrbitLogo.jsx';
import { DEFAULT_PROJECT } from './conversations.js';
import Icon from '../brand/Icon.jsx';
import { MdFilledTonalButton, MdIconButton, MdList } from '../md/index.jsx';

// Always present, never created and never deletable. New chats land here when
// no project was chosen, so the sidebar is never a blank panel with nowhere
// obvious to put anything.
const DEFAULT_GROUP = { id: DEFAULT_PROJECT, name: 'default' };

// Remembered like the sidebar's width: a split you set once should not be
// something you re-drag every session.
const SPLIT_KEY = 'orbit.chat.sectionSplit';

function readSplit() {
  try {
    const raw = window.localStorage.getItem(SPLIT_KEY);
    return raw ? clampSplit(Number(raw)) : SPLIT_DEFAULT;
  } catch {
    return SPLIT_DEFAULT;
  }
}

export default function ChatSidebar({
  searchInputRef,
  projects,
  conversations,
  onTogglePin,
  onRename,
  activeId,
  collapsed,
  onToggleCollapsed,
  onSelect,
  onNewChat,
  onCreateProject,
  onDelete,
  onMove,
  onOpenTab,
  width,
}) {
  const [collapsedProjects, setCollapsedProjects] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const { isOpen, toggle } = useCollapsedSections();

  // How much of the sidebar the Clusters pane gets. A fraction rather than a
  // pixel height, so the split survives a window resize.
  const [split, setSplit] = useState(readSplit);
  const panesRef = useRef(null);

  const resize = (next) => {
    setSplit(next);
    try { window.localStorage.setItem(SPLIT_KEY, String(next)); } catch { /* private mode */ }
  };

  // Only meaningful when both panes are actually showing something.
  const splitActive = isOpen('clusters') && (isOpen('pinned') || isOpen('chats'));
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState('');

  // Pinned chats are lifted out of the project grouping rather than listed in
  // both places. Seeing the same chat twice in one sidebar is worse than
  // losing sight of which project it belongs to.
  const pinned = useMemo(
    () => conversations
      .filter((c) => c.pinnedAt)
      .sort((a, b) => new Date(b.pinnedAt) - new Date(a.pinnedAt)),
    [conversations]
  );

  const byProject = useMemo(() => {
    const map = new Map([DEFAULT_GROUP, ...projects].map((p) => [p.id, []]));
    const loose = [];
    // Newest first, so the sidebar answers "what was I just doing".
    const sorted = [...conversations].sort(
      (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
    );
    for (const c of sorted) {
      if (c.pinnedAt) continue;
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
        <OrbitLogo size={26} />
        <MdIconButton
          className="chat-side__expand"
          onClick={onToggleCollapsed}
          title="Show chats"
          aria-label="Show chats"
        >
          <Icon name="menu" size={24} />
        </MdIconButton>
      </aside>
    );
  }

  return (
    <aside className="chat-side" style={{ flexBasis: `${width}px` }}>
      <div className="chat-side__brand">
        <OrbitLogo size={34} />
        <span className="orbit-wordmark chat-side__wordmark">OrbitAI</span>
      </div>

      <div className="chat-side__top">
        <MdFilledTonalButton className="chat-side__new" onClick={() => onNewChat(null)}>
          <Icon name="add" size={18} slot="icon" />
          New chat
        </MdFilledTonalButton>
        <MdIconButton
          className="chat-side__collapse"
          onClick={onToggleCollapsed}
          title="Hide chats"
          aria-label="Hide chats"
        >
          <Icon name="left_panel_close" size={24} />
        </MdIconButton>
      </div>

      {/* Two panes that scroll independently, with a draggable divider. One
          shared scroller would mean growing the cluster tree pushes the chat
          list off the bottom, which is the thing the divider exists to stop. */}
      <div className="chat-side__panes" ref={panesRef}>
        <div
          className="chat-side__pane chat-side__pane--clusters"
          // Only while both panes are open: a collapsed Chats should let
          // Clusters have the whole sidebar rather than sit at 40% of it.
          style={splitActive ? { flex: `0 0 ${split * 100}%` } : undefined}
        >
          {/* Above Chats: the tree is what the conversations are about, and it
              is the part that does not grow as chats accumulate. */}
          <ClusterTree
            onOpenTab={onOpenTab}
            sectionOpen={isOpen('clusters')}
            onToggleSection={() => toggle('clusters')}
          />
        </div>

        {splitActive && (
          <SectionResizer
            split={split}
            onResize={resize}
            onReset={() => resize(SPLIT_DEFAULT)}
            containerRef={panesRef}
          />
        )}

        <div className="chat-side__pane chat-side__pane--chats">

        {pinned.length > 0 && (
          <section className="chat-side__group">
            <SectionHead
              label="Pinned"
              count={pinned.length}
              open={isOpen('pinned')}
              onToggle={() => toggle('pinned')}
            />
            {isOpen('pinned') && (
            <MdList className="chat-side__items">
              {pinned.map((c) => (
                <ChatListItem
                  key={c.id}
                  conversation={c}
                  active={c.id === activeId}
                  onSelect={onSelect}
                  onDelete={onDelete}
                  onMove={onMove}
                  onTogglePin={onTogglePin}
                  onRename={onRename}
                  projects={projects}
                />
              ))}
            </MdList>
            )}
          </section>
        )}

        <SectionHead
          label="Chats"
          count={conversations.length}
          open={isOpen('chats')}
          onToggle={() => toggle('chats')}
          actions={
            <MdIconButton
              className="chat-side__section-add"
              onClick={() => setCreating(true)}
              title="New project"
              aria-label="New project"
            >
              <Icon name="create_new_folder" size={20} />
            </MdIconButton>
          }
        />

        {isOpen('chats') && (<>
        <ChatSearch
          inputRef={searchInputRef}
          query={searchQuery}
          onQueryChange={setSearchQuery}
          activeId={activeId}
          onSelect={onSelect}
        />

        {!isSearching(searchQuery) && creating && (
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

        {!isSearching(searchQuery) && conversations.length === 0 && (
          <p className="chat-side__empty-group">
            No chats yet. Ask something to start one.
          </p>
        )}

        {!isSearching(searchQuery) && conversations.length > 0 &&
          [DEFAULT_GROUP, ...projects].map((p) => (
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
            onTogglePin={onTogglePin}
            onRename={onRename}
            projects={projects}
          />
        ))}
        </>)}
        </div>
      </div>
    </aside>
  );
}
