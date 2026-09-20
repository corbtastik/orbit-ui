import React, { useEffect, useRef, useState } from 'react';
import * as chatApi from '../../api/chat.js';
import Icon from '../brand/Icon.jsx';
import { MdFilledTextField, MdIconButton, MdListItem, MdList } from '../md/index.jsx';
import { relativeTime } from './conversations.js';

// Search across chat titles and message text.
//
// Server-side, because the sidebar list deliberately does not carry message
// bodies -- it is fetched with the transcripts projected away, and the thing
// people remember is usually a sentence in the middle of one.

const DEBOUNCE_MS = 220;

export const MIN_QUERY_LENGTH = 2;

/** Whether a query is long enough that results stand in for the chat list. */
export const isSearching = (q) => (q ?? '').trim().length >= MIN_QUERY_LENGTH;

// `query` defaults rather than being assumed: the effect trims it and
// md-filled-text-field reads .length off its value, so an undefined prop is
// two crashes rather than an empty box. Reached during an HMR swap, and by
// any caller that renders this without wiring the state up.
/**
 * The snippet with every occurrence of the query marked.
 *
 * Without this the reader has to re-find, inside the snippet, the word they
 * just typed -- which is the one thing they already know.
 */
function highlight(text, query) {
  const q = query.trim();
  if (!q) return text;
  const rx = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig');
  return text.split(rx).map((part, i) =>
    // The split keeps the captured separators at the odd indices.
    i % 2 === 1 ? <mark key={i} className="chat-search__mark">{part}</mark> : part
  );
}

export default function ChatSearch({ query = '', onQueryChange, activeId, onSelect, inputRef }) {
  const [results, setResults] = useState(null);
  // Which result the arrow keys are on. Reset whenever the results change,
  // or the cursor would point at a row from the previous query.
  const [cursor, setCursor] = useState(-1);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState(null);

  // Every keystroke would otherwise be a collection scan. The trailing edge
  // is the right one here: search while typing is a preview, and firing on
  // the leading edge would search the first letter of every word.
  const timer = useRef(null);

  useEffect(() => {
    const q = query.trim();
    clearTimeout(timer.current);

    if (q.length < MIN_QUERY_LENGTH) {
      setResults(null);
      setSearching(false);
      setError(null);
      setCursor(-1);
      return undefined;
    }

    setSearching(true);
    let cancelled = false;
    timer.current = setTimeout(async () => {
      try {
        const rows = await chatApi.searchConversations(q);
        // A slow response for a query the reader has already moved past must
        // not overwrite the results for the one they are looking at.
        if (!cancelled) { setResults(rows); setError(null); setCursor(-1); }
      } catch (err) {
        if (!cancelled) { setError(err.message); setResults([]); }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => { cancelled = true; clearTimeout(timer.current); };
  }, [query]);

  return (
    <div className="chat-search">
      <div className="chat-search__field">
        <MdFilledTextField
          className="chat-search__input"
          placeholder="Search chats"
          ref={inputRef}
          value={query}
          onInput={(e) => onQueryChange?.(e.target.value)}
          onKeyDown={(e) => {
            const n = results?.length ?? 0;
            if (e.key === 'Escape') { onQueryChange?.(''); return; }
            if (!n) return;
            if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => (c + 1) % n); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => (c - 1 + n) % n); }
            if (e.key === 'Enter' && cursor >= 0) { e.preventDefault(); onSelect(results[cursor].id); }
          }}
        >
          <Icon slot="leading-icon" name="search" size={20} />
        </MdFilledTextField>
        {query && (
          <MdIconButton
            className="chat-search__clear"
            onClick={() => onQueryChange?.('')}
            title="Clear search"
            aria-label="Clear search"
          >
            <Icon name="close" size={18} />
          </MdIconButton>
        )}
      </div>

      {isSearching(query) && (
        <div className="chat-search__results">
          {error && <p className="chat-side__empty-group">{error}</p>}

          {!error && results === null && searching && (
            <p className="chat-side__empty-group">Searching…</p>
          )}

          {!error && results?.length === 0 && (
            <p className="chat-side__empty-group">No chats match “{query.trim()}”.</p>
          )}

          {!error && results?.length > 0 && (
            <MdList className="chat-search__list">
              {results.map((r, i) => (
                <MdListItem
                  key={r.id}
                  type="button"
                  className={`chat-side__row chat-search__hit ${
                    r.id === activeId || i === cursor ? 'chat-side__row--active' : ''
                  }`}
                  onClick={() => onSelect(r.id)}
                >
                  <span slot="headline" className="chat-side__item-title">
                    {highlight(r.title, query)}
                  </span>
                  {/* Only present when the match was in the transcript. A
                      title match needs no snippet -- the title is right
                      there. */}
                  {r.match && (
                    <span slot="supporting-text" className="chat-search__snippet">
                      <span className="chat-search__role">{r.match.role}</span>
                      {highlight(r.match.text, query)}
                    </span>
                  )}
                  <span slot="trailing-supporting-text">{relativeTime(r.updatedAt)}</span>
                </MdListItem>
              ))}
            </MdList>
          )}
        </div>
      )}
    </div>
  );
}
