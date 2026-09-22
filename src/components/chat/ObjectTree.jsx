import React, { useEffect, useState } from 'react';
import * as chatApi from '../../api/chat.js';
import Icon from '../brand/Icon.jsx';
import SectionHead from './SectionHead.jsx';
import { MdListItem } from '../md/index.jsx';

// The object-storage tree: store -> buckets, for whatever is configured as
// ORBIT_OBJECT_* in .env.
//
// Read-only, like the cluster tree beside it, and for the same reason: this is
// a window onto what is there.
//
// Two levels rather than three. A bucket's contents are a page of a possibly
// enormous flat namespace, and S3 paging is forward-only -- there is no
// sensible way to render that inline in a sidebar, so opening a bucket opens
// a tab instead.

const StoreIcon = () => <Icon name="cloud" size={20} />;
const BucketIcon = () => <Icon name="folder_open" size={20} fill />;

const Caret = ({ open }) => (
  <Icon name="chevron_right" size={20} className={open ? 'icon--rotated' : ''} />
);

export default function ObjectTree({ onOpenTab, sectionOpen = true, onToggleSection }) {
  const [stores, setStores] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openStores, setOpenStores] = useState({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await chatApi.listStores();
        if (cancelled) return;
        setStores(rows);
        // One store is the common case, and leaving it shut means the section
        // opens on a row that tells the reader nothing.
        if (rows.length === 1) setOpenStores({ [rows[0].id]: true });
      } catch (err) {
        if (!cancelled) setLoadError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Nothing configured is the ordinary case, not an error: object storage is
  // optional. The section removes itself rather than standing there empty
  // explaining a variable the reader may have no interest in setting.
  if (!loading && !loadError && stores.length === 0) return null;

  const toggleStore = (id) => setOpenStores((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <section className="cluster-tree">
      <SectionHead
        label="Object Storage"
        count={stores.length || null}
        open={sectionOpen}
        onToggle={onToggleSection}
      />

      {sectionOpen && (
        <>
          {loading && <p className="cluster-tree__note">Loading…</p>}

          {loadError && (
            <p className="cluster-tree__note cluster-tree__note--error">{loadError}</p>
          )}

          {stores.map((store) => {
            const open = !!openStores[store.id];
            return (
              <div key={store.id} className="cluster-tree__cluster">
                <MdListItem
                  type="button"
                  className="cluster-tree__row cluster-tree__row--cluster"
                  onClick={() => toggleStore(store.id)}
                  aria-expanded={open}
                >
                  <span slot="start" className="cluster-tree__lead">
                    <Caret open={open} />
                    <span className="cluster-tree__icon-wrap">
                      <StoreIcon />
                      <span
                        className={`cluster-tree__status cluster-tree__status--${store.status}`}
                        title={store.status === 'ok' ? 'Connected' : store.error}
                      />
                    </span>
                  </span>
                  <span slot="headline" className="cluster-tree__name">{store.name}</span>
                </MdListItem>

                {open && store.status === 'error' && (
                  <p className="cluster-tree__note cluster-tree__note--error">{store.error}</p>
                )}

                {open && store.status === 'ok' && (store.buckets ?? []).length === 0 && (
                  <p className="cluster-tree__note cluster-tree__note--nested">No buckets.</p>
                )}

                {open &&
                  (store.buckets ?? []).map((bucket) => (
                    <div key={bucket.name} className="cluster-tree__row cluster-tree__row--db">
                      {/* No twisty: a bucket has nothing to expand into here.
                          The whole row opens the tab, so the dead caret column
                          the databases use would be a control that does
                          nothing. */}
                      <button
                        type="button"
                        className="cluster-tree__open cluster-tree__open--flush"
                        onClick={() =>
                          onOpenTab?.({
                            kind: 'bucket',
                            storeId: store.id,
                            storeName: store.name,
                            bucket: bucket.name,
                          })
                        }
                        title={`Open ${bucket.name}`}
                      >
                        <BucketIcon />
                        <span className="cluster-tree__name">{bucket.name}</span>
                      </button>
                    </div>
                  ))}
              </div>
            );
          })}
        </>
      )}
    </section>
  );
}
