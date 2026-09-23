import React, { useEffect, useState } from 'react';
import * as chatApi from '../../api/chat.js';
import Icon from '../brand/Icon.jsx';
import { MdTextButton } from '../md/index.jsx';
import { formatBytes } from './format.js';

// The objects in one bucket. Read-only.
//
// Paging here is forward-only, which is the one real difference from the
// document views beside it. S3 answers a listing with an opaque continuation
// token rather than an offset, so there is no way to ask for page five
// without having walked pages one to four, and no count without listing the
// whole bucket. Rather than fake page numbers it cannot honour, this keeps
// the tokens it has already been given and walks back through them.

const PAGE_SIZE = 50;

/** "2026-09-14T16:35:21.609Z" -> "14 Sep 2026, 11:35" in the reader's zone. */
function formatWhen(iso) {
  if (!iso) return '–';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '–'
    : d.toLocaleString(undefined, {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
}

export default function ObjectsTable({ tab, onOpenObject }) {
  const [page, setPage] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  // The prefix being browsed, and the tokens that got us here. `trail` is what
  // makes Previous possible at all: S3 hands out a token for the next page and
  // never one for the last, so going back means remembering where we have been.
  const [prefix, setPrefix] = useState('');
  const [trail, setTrail] = useState([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const data = await chatApi.listObjects(tab.storeId, tab.bucket, {
          prefix,
          token: trail[trail.length - 1] ?? '',
          limit: PAGE_SIZE,
        });
        if (!cancelled) setPage(data);
      } catch (err) {
        if (!cancelled) { setError(err.message); setPage(null); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tab.storeId, tab.bucket, prefix, trail]);

  // Changing folder starts the walk again: a token is only meaningful against
  // the listing that issued it, and carrying one across a prefix change asks
  // for a page of somewhere else.
  const openPrefix = (next) => { setPrefix(next); setTrail([]); };

  if (error) return <p className="browse__note browse__note--error">{error}</p>;
  if (!page && loading) return <p className="browse__note">Loading…</p>;
  if (!page) return null;

  const { prefixes = [], objects = [], truncated, nextToken } = page;
  const empty = prefixes.length === 0 && objects.length === 0;

  // The prefix as clickable segments, so a reader three folders deep can get
  // back out without re-opening the bucket.
  const crumbs = prefix ? prefix.replace(/\/$/, '').split('/') : [];

  return (
    <div className="browse">
      <header className="browse__head">
        <h2 className="browse__title">{tab.bucket}</h2>
        <p className="browse__sub">
          {tab.storeName}
          {' · '}
          {objects.length} object{objects.length === 1 ? '' : 's'}
          {prefixes.length > 0 && ` · ${prefixes.length} folder${prefixes.length === 1 ? '' : 's'}`}
          {truncated && ' · more available'}
        </p>
      </header>

      {crumbs.length > 0 && (
        <nav className="browse__crumbs" aria-label="Prefix">
          <button type="button" className="browse__link" onClick={() => openPrefix('')}>
            {tab.bucket}
          </button>
          {crumbs.map((part, i) => (
            <React.Fragment key={`${part}-${i}`}>
              <span className="browse__crumb-sep">/</span>
              {i === crumbs.length - 1 ? (
                <span className="browse__crumb-current">{part}</span>
              ) : (
                <button
                  type="button"
                  className="browse__link"
                  onClick={() => openPrefix(`${crumbs.slice(0, i + 1).join('/')}/`)}
                >
                  {part}
                </button>
              )}
            </React.Fragment>
          ))}
        </nav>
      )}

      {empty && <p className="browse__note">Nothing here.</p>}

      {!empty && (
        <div className="browse__table-wrap">
          <table className="browse__table">
            <thead>
              <tr>
                <th className="browse__th--left">Name</th>
                <th className="browse__th--right">Size</th>
                <th className="browse__th--left">Last modified</th>
                <th className="browse__th--left">Storage class</th>
                <th className="browse__th--left">ETag</th>
              </tr>
            </thead>
            <tbody>
              {/* Folders first, the way every file browser does it. */}
              {prefixes.map((p) => (
                <tr key={`p:${p}`}>
                  <td>
                    <button type="button" className="browse__link" onClick={() => openPrefix(p)}>
                      <Icon name="folder" size={16} fill className="browse__row-icon" />
                      {p.slice(prefix.length).replace(/\/$/, '')}
                    </button>
                  </td>
                  <td className="browse__td--right browse__muted">–</td>
                  <td className="browse__muted">–</td>
                  <td className="browse__muted">–</td>
                  <td className="browse__muted">–</td>
                </tr>
              ))}

              {objects.map((o) => (
                <tr key={`o:${o.key}`}>
                  <td>
                    {/* Opens the object in its own tab, the same way a
                        collection name opens its documents. */}
                    <button
                      type="button"
                      className="browse__link"
                      onClick={() => onOpenObject?.(o.key)}
                    >
                      <Icon name="draft" size={16} className="browse__row-icon" />
                      {o.key.slice(prefix.length)}
                    </button>
                  </td>
                  <td className="browse__td--right">{formatBytes(o.size)}</td>
                  <td>{formatWhen(o.lastModified)}</td>
                  <td className="browse__muted">{o.storageClass ?? '–'}</td>
                  <td className="browse__muted browse__etag">{o.etag || '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* No page numbers: see the note at the top. Previous walks back down
          the tokens already collected rather than asking for an offset. */}
      {(truncated || trail.length > 0) && (
        <footer className="browse__pager">
          <MdTextButton
            disabled={trail.length === 0 || loading}
            onClick={() => setTrail((t) => t.slice(0, -1))}
          >
            <Icon name="chevron_left" size={18} slot="icon" />
            Previous
          </MdTextButton>
          <span className="browse__pager-label">
            Page {trail.length + 1}
            {loading && ' · loading…'}
          </span>
          <MdTextButton
            disabled={!truncated || !nextToken || loading}
            onClick={() => setTrail((t) => [...t, nextToken])}
          >
            Next
            <Icon name="chevron_right" size={18} slot="icon" />
          </MdTextButton>
        </footer>
      )}
    </div>
  );
}
