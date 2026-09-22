import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as chatApi from '../../api/chat.js';
import Icon from '../brand/Icon.jsx';
import { useBrowseIndex, searchIndex, MIN_QUERY_LENGTH } from '../../hooks/useBrowseIndex.js';
import { relativeTime } from './conversations.js';

// One search across both halves of the app: what the clusters hold, and what
// was said about them.
//
// A palette rather than a single box at the top of the sidebar. The tree's own
// filter narrows in place, which is a different and genuinely useful thing --
// you keep your bearings while it hides what does not match -- and turning it
// into a result list would lose that. The inline boxes stay; this is the way
// in when you do not want to look for the box first.

const DEBOUNCE_MS = 200;

// The only place chats are searched now, so it shows a few more than a
// secondary list would.
const MAX_CHATS = 8;

/** The text with every occurrence of the query marked. */
function highlight(text, query) {
  const q = query.trim();
  if (!q) return text;
  const rx = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig');
  // The split keeps the captured separators at the odd indices.
  return String(text).split(rx).map((part, i) =>
    i % 2 === 1 ? <mark key={i} className="palette__mark">{part}</mark> : part
  );
}

const ICON = { cluster: 'dns', database: 'database', collection: 'folder' };

export default function CommandPalette({ open, onClose, onOpenTab, onSelectChat }) {
  const [query, setQuery] = useState('');
  const [chats, setChats] = useState([]);
  const [searching, setSearching] = useState(false);
  const [cursor, setCursor] = useState(0);

  const { entries, truncated, building, build } = useBrowseIndex();
  const inputRef = useRef(null);
  const timer = useRef(null);

  // Built on open, not on mount: a session that never opens this should not
  // pay a call per database for it.
  //
  // Depends on `open` alone. It also listed `build`, whose identity changes
  // once the index lands -- so finishing the build re-ran this and cleared a
  // query typed while it was still indexing.
  const buildRef = useRef(build);
  buildRef.current = build;

  useEffect(() => {
    if (!open) return undefined;
    buildRef.current();
    setQuery('');
    setChats([]);
    setCursor(0);
    // The dialog has to exist before it can hold focus.
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  // Cluster hits are already in memory, so they resolve as you type. Chats are
  // a round trip and lag behind -- deliberately, rather than holding the fast
  // half back to match the slow one.
  const browseHits = useMemo(() => searchIndex(entries, query), [entries, query]);

  useEffect(() => {
    const q = query.trim();
    clearTimeout(timer.current);
    if (q.length < MIN_QUERY_LENGTH) { setChats([]); setSearching(false); return undefined; }

    setSearching(true);
    let cancelled = false;
    timer.current = setTimeout(async () => {
      try {
        const rows = await chatApi.searchConversations(q);
        if (!cancelled) setChats(rows.slice(0, MAX_CHATS));
      } catch {
        if (!cancelled) setChats([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => { cancelled = true; clearTimeout(timer.current); };
  }, [query]);

  // One flat list behind the grouped display, so the arrow keys run straight
  // through both groups without the caller tracking which it is in.
  const flat = useMemo(
    () => [
      ...browseHits.map((e) => ({ kind: 'browse', entry: e })),
      ...chats.map((c) => ({ kind: 'chat', chat: c })),
    ],
    [browseHits, chats]
  );

  useEffect(() => { setCursor(0); }, [query]);

  const activate = (row) => {
    if (!row) return;
    if (row.kind === 'chat') {
      onSelectChat(row.chat.id);
    } else {
      const { entry } = row;
      // A cluster on its own has no tab to open -- the tree is where it lives
      // -- so it opens the tree instead of nothing.
      if (entry.kind === 'cluster') return onClose();
      onOpenTab(
        entry.kind === 'collection'
          ? { kind: 'collection', clusterId: entry.cluster.id, clusterName: entry.cluster.name, db: entry.db, coll: entry.coll }
          : { kind: 'database', clusterId: entry.cluster.id, clusterName: entry.cluster.name, db: entry.db }
      );
    }
    onClose();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
    if (!flat.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => (c + 1) % flat.length); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setCursor((c) => (c - 1 + flat.length) % flat.length); }
    if (e.key === 'Enter')     { e.preventDefault(); activate(flat[cursor]); }
  };

  if (!open) return null;

  const short = query.trim().length < MIN_QUERY_LENGTH;

  return (
    // The scrim closes on click; the panel stops the click so a click inside
    // does not close it.
    <div className="palette__scrim" onClick={onClose} role="presentation">
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Search clusters and chats"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="palette__field">
          <Icon name="search" size={20} />
          <input
            ref={inputRef}
            className="palette__input"
            placeholder="Search clusters, databases, collections and chats…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <kbd className="palette__kbd">esc</kbd>
        </div>

        <div className="palette__results">
          {short && (
            <p className="palette__hint">
              {building ? 'Indexing clusters…' : 'Type at least two characters.'}
            </p>
          )}

          {!short && flat.length === 0 && !searching && (
            <p className="palette__hint">Nothing matches “{query.trim()}”.</p>
          )}

          {browseHits.length > 0 && (
            <>
              <div className="palette__group">Clusters</div>
              {browseHits.map((e, i) => (
                <button
                  key={e.id}
                  type="button"
                  className={`palette__row ${cursor === i ? 'palette__row--active' : ''}`}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => activate(flat[i])}
                >
                  <Icon name={ICON[e.kind]} size={18} />
                  <span className="palette__label">{highlight(e.label, query)}</span>
                  {e.path.length > 0 && <span className="palette__path">{e.path.join(' / ')}</span>}
                  <span className="palette__kind">{e.kind}</span>
                </button>
              ))}
            </>
          )}

          {chats.length > 0 && (
            <>
              <div className="palette__group">Chats</div>
              {chats.map((c, i) => {
                const index = browseHits.length + i;
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`palette__row ${cursor === index ? 'palette__row--active' : ''}`}
                    onMouseEnter={() => setCursor(index)}
                    onClick={() => activate(flat[index])}
                  >
                    <Icon name="chat_bubble" size={18} />
                    <span className="palette__label">{highlight(c.title, query)}</span>
                    {/* Only when the match was in the transcript -- a title
                        match needs no snippet, the title is right there. */}
                    {c.match && (
                      <span className="palette__path">
                        <span className="palette__role">{c.match.role}</span>
                        {highlight(c.match.text, query)}
                      </span>
                    )}
                    <span className="palette__kind">{relativeTime(c.updatedAt)}</span>
                  </button>
                );
              })}
            </>
          )}

          {/* Said rather than silently applied -- a capped index that does not
              report itself reads as a complete one. */}
          {truncated && !short && (
            <p className="palette__hint">
              Only the first databases were indexed; deeper collections may be missing.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
