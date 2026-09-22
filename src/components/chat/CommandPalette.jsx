import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as chatApi from '../../api/chat.js';
import Icon from '../brand/Icon.jsx';
import { useBrowseIndex, searchIndex, MIN_QUERY_LENGTH } from '../../hooks/useBrowseIndex.js';
import { relativeTime } from './conversations.js';

// One search across the whole sidebar: what the clusters hold, what the object
// stores hold, and what was said about any of it.
//
// Reached from the box at the top of the sidebar and from the shortcut. There
// is one search surface and two ways in, which is why neither tree carries a
// filter of its own any more.

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

const ICON = {
  cluster: 'dns', database: 'database', collection: 'folder',
  store: 'cloud', bucket: 'folder_open',
};

// Which display group each kind belongs to, in the order the groups appear.
const GROUP = {
  cluster: 'Clusters', database: 'Clusters', collection: 'Clusters',
  store: 'Object Storage', bucket: 'Object Storage',
};

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
  // through every group without the caller tracking which it is in.
  //
  // Each row carries its own flat index. The arithmetic this replaces --
  // `browseHits.length + i` at the second group's call site -- only worked
  // while there were exactly two groups, and silently selects the wrong row
  // the moment a third appears between them.
  const sections = useMemo(() => {
    const byGroup = new Map();
    for (const entry of browseHits) {
      const label = GROUP[entry.kind] ?? 'Results';
      if (!byGroup.has(label)) byGroup.set(label, []);
      byGroup.get(label).push({ kind: 'browse', entry, key: entry.id });
    }

    const out = [];
    // Fixed order, so the groups do not reshuffle as the query changes.
    for (const label of ['Clusters', 'Object Storage']) {
      if (byGroup.has(label)) out.push({ label, rows: byGroup.get(label) });
    }
    if (chats.length) {
      out.push({
        label: 'Chats',
        rows: chats.map((c) => ({ kind: 'chat', chat: c, key: c.id })),
      });
    }

    let i = 0;
    for (const section of out) for (const row of section.rows) row.index = i++;
    return out;
  }, [browseHits, chats]);

  const flat = useMemo(() => sections.flatMap((s) => s.rows), [sections]);

  useEffect(() => { setCursor(0); }, [query]);

  const activate = (row) => {
    if (!row) return;
    if (row.kind === 'chat') {
      onSelectChat(row.chat.id);
    } else {
      const { entry } = row;
      // A cluster or a store on its own has no tab to open -- the tree is
      // where each lives -- so it closes rather than opening nothing.
      if (entry.kind === 'cluster' || entry.kind === 'store') return onClose();

      if (entry.kind === 'bucket') {
        onOpenTab({
          kind: 'bucket', storeId: entry.store.id, storeName: entry.store.name,
          bucket: entry.bucket,
        });
      } else {
        onOpenTab(
          entry.kind === 'collection'
            ? { kind: 'collection', clusterId: entry.cluster.id, clusterName: entry.cluster.name, db: entry.db, coll: entry.coll }
            : { kind: 'database', clusterId: entry.cluster.id, clusterName: entry.cluster.name, db: entry.db }
        );
      }
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
        aria-label="Search clusters, object storage and chats"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="palette__field">
          <Icon name="search" size={20} />
          <input
            ref={inputRef}
            className="palette__input"
            placeholder="Search databases, collections, buckets and chats…"
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

          {sections.map((section) => (
            <React.Fragment key={section.label}>
              <div className="palette__group">{section.label}</div>
              {section.rows.map((row) => (
                <button
                  key={row.key}
                  type="button"
                  className={`palette__row ${cursor === row.index ? 'palette__row--active' : ''}`}
                  onMouseEnter={() => setCursor(row.index)}
                  onClick={() => activate(row)}
                >
                  {row.kind === 'chat' ? (
                    <>
                      <Icon name="chat_bubble" size={18} />
                      <span className="palette__label">{highlight(row.chat.title, query)}</span>
                      {/* Only when the match was in the transcript -- a title
                          match needs no snippet, the title is right there. */}
                      {row.chat.match && (
                        <span className="palette__path">
                          <span className="palette__role">{row.chat.match.role}</span>
                          {highlight(row.chat.match.text, query)}
                        </span>
                      )}
                      <span className="palette__kind">{relativeTime(row.chat.updatedAt)}</span>
                    </>
                  ) : (
                    <>
                      <Icon name={ICON[row.entry.kind]} size={18} />
                      <span className="palette__label">{highlight(row.entry.label, query)}</span>
                      {row.entry.path.length > 0 && (
                        <span className="palette__path">{row.entry.path.join(' / ')}</span>
                      )}
                      <span className="palette__kind">{row.entry.kind}</span>
                    </>
                  )}
                </button>
              ))}
            </React.Fragment>
          ))}

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
