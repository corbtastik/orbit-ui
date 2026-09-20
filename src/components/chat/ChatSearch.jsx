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

const MIN_QUERY = 2;
const DEBOUNCE_MS = 220;

export default function ChatSearch({ activeId, onSelect }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState(null);

  // Every keystroke would otherwise be a collection scan. The trailing edge
  // is the right one here: search while typing is a preview, and firing on
  // the leading edge would search the first letter of every word.
  const timer = useRef(null);

  useEffect(() => {
    const q = query.trim();
    clearTimeout(timer.current);

    if (q.length < MIN_QUERY) {
      setResults(null);
      setSearching(false);
      setError(null);
      return undefined;
    }

    setSearching(true);
    let cancelled = false;
    timer.current = setTimeout(async () => {
      try {
        const rows = await chatApi.searchConversations(q);
        // A slow response for a query the reader has already moved past must
        // not overwrite the results for the one they are looking at.
        if (!cancelled) { setResults(rows); setError(null); }
      } catch (err) {
        if (!cancelled) { setError(err.message); setResults([]); }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => { cancelled = true; clearTimeout(timer.current); };
  }, [query]);

  const searching_ = query.trim().length >= MIN_QUERY;

  return (
    <div className="chat-search">
      <div className="chat-search__field">
        <MdFilledTextField
          className="chat-search__input"
          placeholder="Search chats"
          value={query}
          onInput={(e) => setQuery(e.target.value)}
        >
          <Icon slot="leading-icon" name="search" size={20} />
        </MdFilledTextField>
        {query && (
          <MdIconButton
            className="chat-search__clear"
            onClick={() => setQuery('')}
            title="Clear search"
            aria-label="Clear search"
          >
            <Icon name="close" size={18} />
          </MdIconButton>
        )}
      </div>

      {searching_ && (
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
              {results.map((r) => (
                <MdListItem
                  key={r.id}
                  type="button"
                  className={`chat-side__row chat-search__hit ${
                    r.id === activeId ? 'chat-side__row--active' : ''
                  }`}
                  onClick={() => onSelect(r.id)}
                >
                  <span slot="headline" className="chat-side__item-title">{r.title}</span>
                  {/* Only present when the match was in the transcript. A
                      title match needs no snippet -- the title is right
                      there. */}
                  {r.match && (
                    <span slot="supporting-text" className="chat-search__snippet">
                      <span className="chat-search__role">{r.match.role}</span>
                      {r.match.text}
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
