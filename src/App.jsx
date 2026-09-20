import React, { useRef, useEffect, useState, useCallback } from 'react';

import { useChatStream } from './hooks/useChatStream.js';
import { useHotkeys } from './hooks/useHotkeys.js';

import MessageList from './components/chat/MessageList.jsx';
import Composer from './components/chat/Composer.jsx';
import ProviderSelector from './components/chat/ProviderSelector.jsx';
import ChatSidebar from './components/chat/ChatSidebar.jsx';
import ActivityBar from './components/chat/ActivityBar.jsx';
import SidebarResizer, {
  SIDEBAR_DEFAULT,
  clampSidebarWidth,
} from './components/chat/SidebarResizer.jsx';
import ConnectionContext from './components/chat/ConnectionContext.jsx';
import TabBar from './components/browse/TabBar.jsx';
import CollectionsTable from './components/browse/CollectionsTable.jsx';
import DocumentsView from './components/browse/DocumentsView.jsx';
import { DEFAULT_PROVIDER } from './components/chat/providers.js';
import * as chatApi from './api/chat.js';
import { DEFAULT_PROJECT } from './components/chat/conversations.js';
import Icon from './components/brand/Icon.jsx';
import { MdFilledTonalButton, MdTextButton } from './components/md/index.jsx';

// Nobody knows what to ask a new chat box, and this one's range is not
// obvious -- it spans Atlas administration and querying data inside a
// cluster. One of each, so both halves are discoverable.
const EXAMPLE_PROMPTS = [
  'What projects and clusters can you see?',
  'Summarise the databases and collections on my cluster',
  'Which collections are the largest, and how are they indexed?',
  'Show me the database users and network access rules for this project',
];

// Remembered across reloads: a width you chose once should not be something
// you re-drag every session.
const WIDTH_KEY = 'orbit.chat.sidebarWidth';

function readStoredWidth() {
  try {
    const raw = window.localStorage.getItem(WIDTH_KEY);
    return raw ? clampSidebarWidth(Number(raw)) : SIDEBAR_DEFAULT;
  } catch {
    return SIDEBAR_DEFAULT;
  }
}

let nextId = 1;
const newId = (prefix) => `${prefix}-new-${nextId++}`;

// Tab identity is the thing being looked at, so opening the same database
// twice focuses the tab that is already there rather than stacking a second.
const tabId = (tab) =>
  tab.kind === 'collection'
    ? `coll:${tab.clusterId}/${tab.db}/${tab.coll}`
    : `db:${tab.clusterId}/${tab.db}`;

export default function App() {
  const [projects, setProjects] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(readStoredWidth);
  const [draft, setDraft] = useState('');
  // Switching provider changes what the *next* turn uses. The transcript is
  // deliberately untouched: a conversation that spans several models is the
  // interesting case, not an accident to guard against.
  const [provider, setProvider] = useState(DEFAULT_PROVIDER);
  // Browse tabs opened from the sidebar tree. 'chat' is not in this list --
  // it is always present and always first.
  const [tabs, setTabs] = useState([]);
  const [activeTab, setActiveTab] = useState('chat');
  const scrollRef = useRef(null);
  const searchInputRef = useRef(null);
  // Where each conversation was last read, so switching away and back does
  // not dump you at the bottom of a transcript you were part-way through.
  const scrollMemory = useRef(new Map());

  const { messages, isStreaming, error, activity, context, send, stop, reset } = useChatStream({
    provider,
    conversationId: activeId ?? undefined,
  });

  // Pinned while the reader is at the bottom; released the moment they scroll
  // away. Dragging someone back down mid-sentence is the worst thing a
  // streaming transcript can do.
  const [pinned, setPinned] = useState(true);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    setPinned(distance < 48);
  }, []);

  // Load the sidebar once. Failures are surfaced rather than leaving an
  // empty list that looks like "no history" when it is really "no server".
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [ps, cs] = await Promise.all([chatApi.listProjects(), chatApi.listConversations()]);
        if (cancelled) return;
        setProjects(ps);
        setConversations(cs);
      } catch (err) {
        if (!cancelled) setLoadError(err.message);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const jumpToLatest = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    setPinned(true);
  }, []);

  useEffect(() => {
    if (!pinned) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, pinned]);

  const handleResize = (px) => {
    setSidebarWidth(px);
    try { window.localStorage.setItem(WIDTH_KEY, String(px)); } catch { /* private mode */ }
  };

  const handleSelect = async (id) => {
    if (id === activeId) return;

    // Remember where we were before the transcript is replaced.
    if (activeId && scrollRef.current) {
      scrollMemory.current.set(activeId, scrollRef.current.scrollTop);
    }

    setActiveId(id);
    reset([]);
    try {
      const conversation = await chatApi.getConversation(id);
      reset(conversation.messages ?? []);

      // Restore after the transcript has rendered. A conversation never
      // opened before has no remembered position and starts at the end,
      // which is where a chat is normally resumed.
      const previous = scrollMemory.current.get(id);
      requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (!el) return;
        el.scrollTop = previous ?? el.scrollHeight;
        const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
        setPinned(distance < 48);
      });
    } catch (err) {
      setLoadError(err.message);
    }
  };

  const handleNewChat = async (projectId) => {
    try {
      const conversation = await chatApi.createConversation({
        title: 'New chat',
        projectId: projectId ?? DEFAULT_PROJECT,
        provider,
      });
      setConversations((prev) => [conversation, ...prev]);
      setActiveId(conversation.id);
      reset([]);
      setDraft('');
      setPinned(true);
    } catch (err) {
      setLoadError(err.message);
    }
  };

  // Deleting the open conversation has to leave something selected, or the
  // view shows a transcript belonging to nothing.
  const handleDeleteChat = async (id) => {
    try {
      await chatApi.deleteConversation(id);
    } catch (err) {
      setLoadError(err.message);
      return;
    }
    const remaining = conversations.filter((c) => c.id !== id);
    setConversations(remaining);
    if (id === activeId) {
      const next = remaining[0] ?? null;
      setActiveId(next?.id ?? null);
      if (next) handleSelect(next.id); else reset([]);
    }
  };

  // Filing an existing chat. PATCH with projectId: 'default' puts it back
  // under Recent -- the gap the sidebar shipped without.
  const handleMoveChat = async (id, projectId) => {
    try {
      const updated = await chatApi.updateConversation(id, { projectId });
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, ...updated } : c)));
    } catch (err) {
      setLoadError(err.message);
    }
  };

  // Pinning does not touch updatedAt server-side, so the sort order of the
  // main list is unaffected -- the row just moves into the Pinned section.
  const handleTogglePin = async (id, pinned) => {
    try {
      const updated = await chatApi.setPinned(id, pinned);
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, ...updated } : c)));
    } catch (err) {
      setLoadError(err.message);
    }
  };

  const handleRenameChat = async (id, title) => {
    try {
      const updated = await chatApi.updateConversation(id, { title });
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, ...updated } : c)));
    } catch (err) {
      setLoadError(err.message);
    }
  };

  const handleCreateProject = async (name) => {
    try {
      const project = await chatApi.createProject(name);
      setProjects((prev) => [...prev, project]);
    } catch (err) {
      setLoadError(err.message);
    }
  };

  const openTab = useCallback((tab) => {
    const id = tabId(tab);
    setTabs((prev) => (prev.some((t) => t.id === id) ? prev : [...prev, { ...tab, id }]));
    setActiveTab(id);
  }, []);

  // Closing the tab you are on falls back to Chat rather than to a neighbour:
  // Chat is always there, and guessing a neighbour is how you end up looking
  // at a collection you did not ask for.
  const closeTab = useCallback((id) => {
    setTabs((prev) => prev.filter((t) => t.id !== id));
    setActiveTab((current) => (current === id ? 'chat' : current));
  }, []);

  // The shortcuts people reach for without being told. Declared after the
  // handlers they call -- these are const arrow functions, so referencing one
  // earlier is a temporal dead zone error at render, not a hoisted no-op.
  useHotkeys({
    'mod+k': () => {
      setSidebarCollapsed(false);
      // focus() on a Material field forwards into its shadow input.
      searchInputRef.current?.focus?.();
    },
    'mod+shift+o': () => handleNewChat(null),
    'mod+/': () => setSidebarCollapsed((v) => !v),
  });

  const handleSubmit = async (text) => {
    setDraft('');
    setPinned(true);

    // A chat has to exist before turns can be appended to it.
    let conversationId = activeId;
    if (!conversationId) {
      try {
        const conversation = await chatApi.createConversation({
          title: text.slice(0, 48),
          projectId: DEFAULT_PROJECT,
          provider,
        });
        setConversations((prev) => [conversation, ...prev]);
        setActiveId(conversation.id);
        conversationId = conversation.id;
      } catch (err) {
        setLoadError(err.message);
        return;
      }
    }

    const current = conversations.find((c) => c.id === conversationId);

    // Everything from here is wrapped. Previously an exception between send()
    // and appendTurns became an unhandled rejection: no request, no error, no
    // clue -- the failure mode that made this hard to find.
    try {
      // The id is passed explicitly rather than read from the hook's closure.
      // A conversation created moments ago is not in that closure yet, so the
      // first message of a new chat would otherwise land in the shared
      // "default" MCP session.
      const { user, assistant, skipped } = await send(text, conversationId);
      if (skipped) return; // a reply was already in flight

      // One write, after the reply finishes -- never per token. A stopped or
      // failed reply is still worth keeping, so it is persisted either way.
      const updated = await chatApi.appendTurns(conversationId, {
        turns: [user, assistant],
        title: current && current.messageCount === 0 ? text.slice(0, 48) : undefined,
        provider,
      });
      setConversations((prev) =>
        prev
          .map((c) => (c.id === conversationId ? { ...c, ...updated } : c))
          .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      );
    } catch (err) {
      console.error('[chat] submit failed:', err);
      setLoadError(err?.message ?? 'the message could not be sent');
    }
  };

  return (
    <div className="chat-view">
      <ChatSidebar
        projects={projects}
        conversations={conversations}
        activeId={activeId}
        collapsed={sidebarCollapsed}
        searchInputRef={searchInputRef}
        onToggleCollapsed={() => setSidebarCollapsed((v) => !v)}
        onSelect={handleSelect}
        onNewChat={handleNewChat}
        onCreateProject={handleCreateProject}
        onDelete={handleDeleteChat}
        onMove={handleMoveChat}
        onTogglePin={handleTogglePin}
        onRename={handleRenameChat}
        onOpenTab={openTab}
        width={sidebarWidth}
      />

      {!sidebarCollapsed && (
        <SidebarResizer
          width={sidebarWidth}
          onResize={handleResize}
          onReset={() => handleResize(SIDEBAR_DEFAULT)}
        />
      )}

      <div className="chat__main">
      <TabBar tabs={tabs} activeId={activeTab} onSelect={setActiveTab} onClose={closeTab} />

      {/* Hidden rather than unmounted. A reply streams for 45-90 seconds, and
          browsing a collection mid-answer must not throw away the transcript's
          scroll position or remount the list it is appending to. */}
      <div className={`chat__pane ${activeTab === 'chat' ? '' : 'chat__pane--hidden'}`}>
      <header className="chat__header">
        <div>
          <h1>OrbitAI</h1>
          <p className="chat__subtitle">
            Ask about your MongoDB Atlas projects, clusters and data
          </p>
        </div>
        <div className="chat__header-controls">
          <ConnectionContext context={context} />
          <ProviderSelector value={provider} onChange={setProvider} />
        </div>
      </header>

      <div className="chat__transcript" ref={scrollRef} onScroll={handleScroll}>
        {messages.length === 0 ? (
          <div className="chat__empty">
            <h2>Mission control for MongoDB Atlas</h2>
            <p>Ask in plain language. Try one of these:</p>
            <ul className="chat__examples">
              {EXAMPLE_PROMPTS.map((p) => (
                <li key={p}>
                  <button type="button" onClick={() => setDraft(p)}>{p}</button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <MessageList messages={messages} />
        )}
      </div>

      <ActivityBar activity={activity} />

      {!pinned && messages.length > 0 && (
        <MdFilledTonalButton className="chat__jump" onClick={jumpToLatest}>
          Jump to latest
          <Icon name="arrow_downward" size={18} slot="icon" />
        </MdFilledTonalButton>
      )}

      {loadError && (
        <div className="chat__error" role="alert">
          <span>{loadError}</span>
          <MdTextButton onClick={() => setLoadError(null)}>Dismiss</MdTextButton>
        </div>
      )}

      {error && (
        <div className="chat__error" role="alert">
          <span>{error}</span>
          <MdTextButton onClick={() => send(messages.at(-2)?.text ?? '')}>
            Retry
          </MdTextButton>
        </div>
      )}

      <Composer
        value={draft}
        onChange={setDraft}
        onSubmit={handleSubmit}
        disabled={isStreaming}
        streaming={isStreaming}
        onStop={stop}
      />
      </div>

      {tabs.map((tab) => tab.id !== activeTab ? null : (
        <div className="browse__pane" key={tab.id}>
          {tab.kind === 'collection' ? (
            <DocumentsView tab={tab} />
          ) : (
            <CollectionsTable
              tab={tab}
              onOpenCollection={(coll) => openTab({ ...tab, kind: 'collection', coll })}
            />
          )}
        </div>
      ))}
      </div>
    </div>
  );
}
