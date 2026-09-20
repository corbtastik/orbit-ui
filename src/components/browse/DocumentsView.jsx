import React, { useEffect, useState } from 'react';
import * as chatApi from '../../api/chat.js';
import JsonView, { OPEN_TO_DEPTH, OPEN_ALL } from './JsonView.jsx';
import { formatCount } from './format.js';
import Icon from '../brand/Icon.jsx';

const PAGE_SIZE = 25;

// One page of documents from a collection. Read-only.
//
// Paged with skip/limit rather than a cursor: the page a reader is on has to
// survive a refetch and be describable as "26 – 50", and a cursor cannot go
// backwards. skip is the wrong tool for deep paging on a large collection,
// which is a real limit of this view and not yet worth a range query.

// One document, with its own expand control. The state is per card rather
// than per page: expanding a 4,000-line document should not also expand the
// twenty-four beside it.
function DocumentCard({ doc }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <article className="browse__doc">
      <button
        type="button"
        className="browse__doc-expand"
        onClick={() => setExpanded((v) => !v)}
        title={expanded ? 'Collapse to the top level' : 'Expand every level'}
        aria-expanded={expanded}
      >
        {expanded ? 'Collapse all' : 'Expand all'}
      </button>

      {/* Keyed on the mode: openDepth only seeds each row's own toggle, so
          changing it has to rebuild the tree to take effect. Remounting also
          discards rows the reader opened by hand, which is what both of
          these buttons mean. */}
      <JsonView
        key={expanded ? 'all' : 'top'}
        value={doc}
        openDepth={expanded ? OPEN_ALL : OPEN_TO_DEPTH}
      />
    </article>
  );
}

export default function DocumentsView({ tab }) {
  const [page, setPage] = useState(null);
  const [skip, setSkip] = useState(0);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  // Reset to the first page when the tab points somewhere else, or a
  // collection opened at page 3 would show page 3 of a different collection.
  useEffect(() => { setSkip(0); }, [tab.clusterId, tab.db, tab.coll]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const data = await chatApi.listDocuments(tab.clusterId, tab.db, tab.coll, {
          skip,
          limit: PAGE_SIZE,
        });
        if (!cancelled) setPage(data);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tab.clusterId, tab.db, tab.coll, skip]);

  const docs = page?.documents ?? [];
  const total = page?.total;
  const first = docs.length === 0 ? 0 : skip + 1;
  const last = skip + docs.length;

  // total is an estimate from collection metadata, so it can lag a page that
  // is genuinely there. Trusting a short count to disable Next would strand
  // the reader; a full page is the better signal that another may follow.
  const hasNext = docs.length === PAGE_SIZE;
  const hasPrev = skip > 0;

  return (
    <div className="browse">
      <header className="browse__head">
        <h2 className="browse__title">{tab.coll}</h2>
        <p className="browse__sub">
          {tab.clusterName} · {tab.db}
          {total != null && <> · ~{formatCount(total)} documents</>}
        </p>
      </header>

      {error && <p className="browse__note browse__note--error">{error}</p>}
      {loading && <p className="browse__note">Loading…</p>}

      {!loading && !error && docs.length === 0 && (
        <p className="browse__note">
          {skip > 0 ? 'No more documents.' : 'This collection is empty.'}
        </p>
      )}

      {!loading && !error && docs.map((doc, i) => (
        // Documents are keyed by position: _id is the usual key, but a
        // collection is not obliged to have one on every document and this
        // view must render whatever is actually stored. Keying on skip too
        // means turning the page resets every card's expand state.
        <DocumentCard key={`${skip}-${i}`} doc={doc} />
      ))}

      {(hasPrev || hasNext) && (
        <div className="browse__pager">
          <button
            type="button"
            className="browse__page-btn"
            disabled={!hasPrev || loading}
            onClick={() => setSkip(Math.max(0, skip - PAGE_SIZE))}
          >
            <Icon name="chevron_left" size={18} /> Previous
          </button>
          <span className="browse__page-range">
            {formatCount(first)} – {formatCount(last)}
            {total != null && <> of ~{formatCount(total)}</>}
          </span>
          <button
            type="button"
            className="browse__page-btn"
            disabled={!hasNext || loading}
            onClick={() => setSkip(skip + PAGE_SIZE)}
          >
            Next <Icon name="chevron_right" size={18} />
          </button>
        </div>
      )}
    </div>
  );
}
