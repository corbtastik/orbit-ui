import React, { useEffect, useMemo, useState } from 'react';
import * as chatApi from '../../api/chat.js';

// The cluster tree: cluster -> databases -> collections, for whatever is
// configured as ORBIT_CLUSTER_* in .env.
//
// Read-only, and it stays that way. This is a view onto what is there; the
// tools are how the app changes anything.
//
// Collections load on first expand and are then kept. A database the reader
// opened, closed and reopened should not re-fetch -- the shape of a database
// does not change on the timescale of a sidebar click.

// Inline rather than an icon dependency: three shapes, each a handful of
// elements, none of them needed anywhere else in the app.
const ClusterIcon = () => (
  <svg className="cluster-tree__icon" viewBox="0 0 16 16" aria-hidden="true">
    <rect x="2" y="2.5" width="12" height="4.5" rx="1" />
    <rect x="2" y="9" width="12" height="4.5" rx="1" />
    <circle className="cluster-tree__icon-pin" cx="4.6" cy="4.75" r="0.85" />
    <circle className="cluster-tree__icon-pin" cx="4.6" cy="11.25" r="0.85" />
  </svg>
);

const DatabaseIcon = () => (
  <svg className="cluster-tree__icon" viewBox="0 0 16 16" aria-hidden="true">
    <ellipse cx="8" cy="4" rx="5.25" ry="2.15" />
    <path d="M2.75 4v8c0 1.2 2.35 2.15 5.25 2.15s5.25-.95 5.25-2.15V4" />
    <path d="M2.75 8c0 1.2 2.35 2.15 5.25 2.15s5.25-.95 5.25-2.15" />
  </svg>
);

const CollectionIcon = () => (
  <svg className="cluster-tree__icon" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M1.9 4.4c0-.6.5-1.1 1.1-1.1h3.1l1.4 1.6h5.6c.6 0 1.1.5 1.1 1.1v6c0 .6-.5 1.1-1.1 1.1H3c-.6 0-1.1-.5-1.1-1.1z" />
  </svg>
);

const Caret = ({ open }) => (
  <span className={`cluster-tree__caret ${open ? 'cluster-tree__caret--open' : ''}`} aria-hidden="true">
    ▸
  </span>
);

export default function ClusterTree({ onOpenTab }) {
  const [clusters, setClusters] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [sectionOpen, setSectionOpen] = useState(true);

  // Keyed "clusterId/dbName" so two clusters with a database of the same name
  // do not share an expansion state.
  const [openClusters, setOpenClusters] = useState({});
  const [openDbs, setOpenDbs] = useState({});
  const [collections, setCollections] = useState({});
  const [pending, setPending] = useState({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await chatApi.listClusters();
        if (cancelled) return;
        setClusters(rows);
        // One cluster is the common case, and leaving it shut means the
        // section opens on a row that tells the reader nothing.
        if (rows.length === 1) setOpenClusters({ [rows[0].id]: true });
      } catch (err) {
        if (!cancelled) setLoadError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const toggleCluster = (id) =>
    setOpenClusters((prev) => ({ ...prev, [id]: !prev[id] }));

  const toggleDb = async (clusterId, dbName) => {
    const key = `${clusterId}/${dbName}`;
    const willOpen = !openDbs[key];
    setOpenDbs((prev) => ({ ...prev, [key]: willOpen }));
    if (!willOpen || collections[key] || pending[key]) return;

    setPending((prev) => ({ ...prev, [key]: true }));
    try {
      const rows = await chatApi.listCollections(clusterId, dbName);
      setCollections((prev) => ({ ...prev, [key]: rows }));
    } catch (err) {
      // Recorded against the row rather than raised: one database that will
      // not list should not close the tree the reader is working in.
      setCollections((prev) => ({ ...prev, [key]: { error: err.message } }));
    } finally {
      setPending((prev) => ({ ...prev, [key]: false }));
    }
  };

  // Filtering matches databases as well as clusters, and a cluster whose name
  // does not match still shows if one of its databases does -- otherwise
  // typing a database name empties the tree that contains it.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clusters;
    return clusters
      .map((c) => {
        if (c.name.toLowerCase().includes(q)) return c;
        const databases = (c.databases ?? []).filter((d) =>
          d.name.toLowerCase().includes(q)
        );
        return databases.length ? { ...c, databases } : null;
      })
      .filter(Boolean);
  }, [clusters, query]);

  return (
    <section className="cluster-tree">
      <div className="chat-side__section-head">
        <span>
          Clusters{clusters.length > 0 && ` (${clusters.length})`}
        </span>
        <button
          type="button"
          className="chat-side__section-add"
          onClick={() => setSectionOpen((v) => !v)}
          title={sectionOpen ? 'Hide clusters' : 'Show clusters'}
          aria-label={sectionOpen ? 'Hide clusters' : 'Show clusters'}
          aria-expanded={sectionOpen}
        >
          {sectionOpen ? '✕' : '›'}
        </button>
      </div>

      {sectionOpen && (
        <>
          {clusters.length > 0 && (
            <input
              className="cluster-tree__search"
              placeholder="Search clusters"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          )}

          {loading && <p className="cluster-tree__note">Loading…</p>}

          {loadError && <p className="cluster-tree__note cluster-tree__note--error">{loadError}</p>}

          {/* An empty tree is almost always an unconfigured one, so it says
              which variable is missing rather than just "none". */}
          {!loading && !loadError && clusters.length === 0 && (
            <p className="cluster-tree__note">
              No clusters configured. Add <code>ORBIT_CLUSTER_1_URI</code> to <code>.env</code>.
            </p>
          )}

          {filtered.map((cluster) => {
            const open = !!openClusters[cluster.id];
            return (
              <div key={cluster.id} className="cluster-tree__cluster">
                <button
                  type="button"
                  className="cluster-tree__row cluster-tree__row--cluster"
                  onClick={() => toggleCluster(cluster.id)}
                  aria-expanded={open}
                >
                  <Caret open={open} />
                  <span className="cluster-tree__icon-wrap">
                    <ClusterIcon />
                    <span
                      className={`cluster-tree__status cluster-tree__status--${cluster.status}`}
                      title={cluster.status === 'ok' ? 'Connected' : cluster.error}
                    />
                  </span>
                  <span className="cluster-tree__name">{cluster.name}</span>
                </button>

                {open && cluster.status === 'error' && (
                  <p className="cluster-tree__note cluster-tree__note--error">{cluster.error}</p>
                )}

                {open &&
                  (cluster.databases ?? []).map((db) => {
                    const key = `${cluster.id}/${db.name}`;
                    const dbOpen = !!openDbs[key];
                    const rows = collections[key];
                    return (
                      <div key={key}>
                        <div
                          className={`cluster-tree__row cluster-tree__row--db ${
                            db.system ? 'cluster-tree__row--system' : ''
                          }`}
                        >
                          {/* Expanding and opening are separate actions on the
                              same row: the caret shows what is inside, the name
                              opens the collections table. Collapsing a database
                              to see its neighbours should not also navigate. */}
                          <button
                            type="button"
                            className="cluster-tree__twisty"
                            onClick={() => toggleDb(cluster.id, db.name)}
                            aria-expanded={dbOpen}
                            aria-label={dbOpen ? `Collapse ${db.name}` : `Expand ${db.name}`}
                          >
                            <Caret open={dbOpen} />
                          </button>
                          <button
                            type="button"
                            className="cluster-tree__open"
                            onClick={() =>
                              onOpenTab?.({
                                kind: 'database',
                                clusterId: cluster.id,
                                clusterName: cluster.name,
                                db: db.name,
                              })
                            }
                            title={`Open ${db.name}`}
                          >
                            <DatabaseIcon />
                            <span className="cluster-tree__name">{db.name}</span>
                          </button>
                        </div>

                        {dbOpen && pending[key] && (
                          <p className="cluster-tree__note cluster-tree__note--nested">Loading…</p>
                        )}

                        {dbOpen && rows?.error && (
                          <p className="cluster-tree__note cluster-tree__note--nested cluster-tree__note--error">
                            {rows.error}
                          </p>
                        )}

                        {dbOpen && Array.isArray(rows) && rows.length === 0 && (
                          <p className="cluster-tree__note cluster-tree__note--nested">No collections</p>
                        )}

                        {dbOpen &&
                          Array.isArray(rows) &&
                          rows.map((c) => (
                            <button
                              type="button"
                              key={c.name}
                              className="cluster-tree__row cluster-tree__row--collection"
                              onClick={() =>
                                onOpenTab?.({
                                  kind: 'collection',
                                  clusterId: cluster.id,
                                  clusterName: cluster.name,
                                  db: db.name,
                                  coll: c.name,
                                })
                              }
                              title={`Open ${db.name}.${c.name}`}
                            >
                              <CollectionIcon />
                              <span className="cluster-tree__name">{c.name}</span>
                            </button>
                          ))}
                      </div>
                    );
                  })}
              </div>
            );
          })}
        </>
      )}
    </section>
  );
}
