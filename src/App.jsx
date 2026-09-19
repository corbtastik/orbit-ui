import React, { useRef, useEffect, useState, useCallback } from 'react';

import { useChatStream } from './hooks/useChatStream.js';

import MessageList from './components/chat/MessageList.jsx';
import Composer from './components/chat/Composer.jsx';
import ProviderSelector from './components/chat/ProviderSelector.jsx';
import ChatSidebar from './components/chat/ChatSidebar.jsx';
import ActivityBar from './components/chat/ActivityBar.jsx';
import SidebarResizer, {
  SIDEBAR_DEFAULT,
  clampSidebarWidth,
} from './components/chat/SidebarResizer.jsx';
import { DEFAULT_PROVIDER } from './components/chat/providers.js';
import * as chatApi from './api/chat.js';
import { DEFAULT_PROJECT } from './components/chat/conversations.js';

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
  const scrollRef = useRef(null);

  const { messages, isStreaming, error, activity, send, stop, reset } = useChatStream({
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
    setActiveId(id);
    setPinned(true);
    reset([]);
    try {
      const conversation = await chatApi.getConversation(id);
      reset(conversation.messages ?? []);
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

  const handleCreateProject = async (name) => {
    try {
      const project = await chatApi.createProject(name);
      setProjects((prev) => [...prev, project]);
    } catch (err) {
      setLoadError(err.message);
    }
  };

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
        onToggleCollapsed={() => setSidebarCollapsed((v) => !v)}
        onSelect={handleSelect}
        onNewChat={handleNewChat}
        onCreateProject={handleCreateProject}
        onDelete={handleDeleteChat}
        onMove={handleMoveChat}
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
      <header className="chat__header">
        <div>
          <h1>OrbitAI</h1>
          <p className="chat__subtitle">
            Ask about your MongoDB Atlas projects, clusters and data
          </p>
        </div>
        <div className="chat__header-controls">
          <div className="chat__context" title="What the assistant can reach">
            <span className="chat__context-dot" />
            Atlas admin · cluster data
          </div>
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
        <button type="button" className="chat__jump" onClick={jumpToLatest}>
          Jump to latest ↓
        </button>
      )}

      {loadError && (
        <div className="chat__error" role="alert">
          <span>{loadError}</span>
          <button type="button" onClick={() => setLoadError(null)}>Dismiss</button>
        </div>
      )}

      {error && (
        <div className="chat__error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => send(messages.at(-2)?.text ?? '')}>
            Retry
          </button>
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
    </div>
  );
}
