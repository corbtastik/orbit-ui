import React, { useEffect, useMemo, useState } from 'react';
import * as chatApi from '../../api/chat.js';
import Icon from '../brand/Icon.jsx';
import SectionHead from './SectionHead.jsx';
import { MdIconButton, MdFilledTextField, MdList, MdListItem } from '../md/index.jsx';

// The cluster tree: cluster -> databases -> collections, for whatever is
// configured as ORBIT_CLUSTER_* in .env.
//
// Read-only, and it stays that way. This is a view onto what is there; the
// tools are how the app changes anything.
//
// Collections load on first expand and are then kept. A database the reader
// opened, closed and reopened should not re-fetch -- the shape of a database
// does not change on the timescale of a sidebar click.

// Material Symbols, not hand-drawn SVGs. These were three inline shapes
// approximating a server, a cylinder and a folder; the real icon set draws
// them correctly and keeps their weight in step with the text beside them.
const ClusterIcon = () => <Icon name="dns" size={20} />;
const DatabaseIcon = () => <Icon name="database" size={20} />;
const CollectionIcon = () => <Icon name="folder" size={20} fill />;

const Caret = ({ open }) => (
  <Icon name="chevron_right" size={20} className={open ? 'icon--rotated' : ''} />
);

export default function ClusterTree({ onOpenTab, sectionOpen = true, onToggleSection }) {
  const [clusters, setClusters] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

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
      <SectionHead
        label="Clusters"
        count={clusters.length || null}
        open={sectionOpen}
        onToggle={onToggleSection}
      />

      {sectionOpen && (
        <>
          {clusters.length > 0 && (
            <MdFilledTextField
              className="cluster-tree__search"
              placeholder="Search clusters"
              value={query}
              onInput={(e) => setQuery(e.target.value)}
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
                <MdListItem
                  type="button"
                  className="cluster-tree__row cluster-tree__row--cluster"
                  onClick={() => toggleCluster(cluster.id)}
                  aria-expanded={open}
                >
                  <span slot="start" className="cluster-tree__lead">
                    <Caret open={open} />
                    <span className="cluster-tree__icon-wrap">
                      <ClusterIcon />
                      <span
                        className={`cluster-tree__status cluster-tree__status--${cluster.status}`}
                        title={cluster.status === 'ok' ? 'Connected' : cluster.error}
                      />
                    </span>
                  </span>
                  <span slot="headline" className="cluster-tree__name">{cluster.name}</span>
                </MdListItem>

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
                            <MdListItem
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
                              <span slot="start"><CollectionIcon /></span>
                              <span slot="headline" className="cluster-tree__name">{c.name}</span>
                            </MdListItem>
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
