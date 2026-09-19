import React, { useEffect, useState } from 'react';
import * as chatApi from '../../api/chat.js';
import { formatBytes, formatCount } from './format.js';

// The collections in one database, with their storage stats. Read-only.

const COLUMNS = [
  { key: 'name', label: 'Collection name', align: 'left' },
  { key: 'properties', label: 'Properties', align: 'left' },
  { key: 'storageSize', label: 'Storage size', align: 'right', format: formatBytes },
  { key: 'dataSize', label: 'Data size', align: 'right', format: formatBytes },
  { key: 'count', label: 'Documents', align: 'right', format: formatCount },
  { key: 'avgObjSize', label: 'Avg. document size', align: 'right', format: formatBytes },
  { key: 'indexes', label: 'Indexes', align: 'right', format: formatCount },
  { key: 'totalIndexSize', label: 'Total index size', align: 'right', format: formatBytes },
];

export default function CollectionsTable({ tab, onOpenCollection }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError(null);
    (async () => {
      try {
        const data = await chatApi.collectionStats(tab.clusterId, tab.db);
        if (!cancelled) setRows(data);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    })();
    return () => { cancelled = true; };
  }, [tab.clusterId, tab.db]);

  if (error) return <p className="browse__note browse__note--error">{error}</p>;
  if (!rows) return <p className="browse__note">Loading…</p>;
  if (rows.length === 0) return <p className="browse__note">This database has no collections.</p>;

  return (
    <div className="browse">
      <header className="browse__head">
        <h2 className="browse__title">{tab.db}</h2>
        <p className="browse__sub">
          {tab.clusterName} · {rows.length} collection{rows.length === 1 ? '' : 's'}
        </p>
      </header>

      <div className="browse__table-wrap">
        <table className="browse__table">
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.key} className={`browse__th--${c.align}`}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name}>
                <td>
                  {/* The name opens the documents view -- the same thing
                      clicking the collection in the sidebar does. */}
                  <button
                    type="button"
                    className="browse__link"
                    onClick={() => onOpenCollection(row.name)}
                  >
                    {row.name}
                  </button>
                </td>
                {/* A view is the only property this reports so far; Compass
                    shows capped and clustered here too. */}
                <td className="browse__muted">{row.type === 'view' ? 'view' : '–'}</td>
                {COLUMNS.slice(2).map((c) => (
                  <td key={c.key} className="browse__td--right">{c.format(row[c.key])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
