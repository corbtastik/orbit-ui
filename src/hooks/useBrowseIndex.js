import { useCallback, useRef, useState } from 'react';
import * as chatApi from '../api/chat.js';

// A flat, searchable index of everything the cluster tree can reach.
//
// The tree's own filter only ever matched cluster and database names, because
// collections are fetched when a database is expanded and an unexpanded one
// has none in memory. So searching for a collection found nothing until you
// had already navigated to it -- which is the moment you no longer need to
// search. This enumerates them up front instead.
//
// Built on first use rather than at startup: it costs a call per database, and
// a session that never opens the palette should not pay for it. Cached for the
// session afterwards -- the shape of a cluster does not change on the
// timescale of someone pressing a shortcut twice.

// A cluster with hundreds of databases would mean hundreds of calls. The cap
// is reported rather than applied silently, the same rule the document table
// follows: a truncated result that does not say so reads as a complete one.
export const MAX_DATABASES = 60;

export function useBrowseIndex() {
  const [entries, setEntries] = useState(null);
  const [truncated, setTruncated] = useState(false);
  const [building, setBuilding] = useState(false);
  // Held in a ref as well as state so a second open during the first build
  // does not start a second enumeration.
  const inFlight = useRef(null);

  const build = useCallback(async () => {
    if (entries) return entries;
    if (inFlight.current) return inFlight.current;

    setBuilding(true);
    inFlight.current = (async () => {
      const out = [];
      let capped = false;
      try {
        const clusters = await chatApi.listClusters();

        // Clusters and databases come from one call, so they are indexed even
        // if the collection pass below is cut short.
        const pending = [];
        for (const c of clusters) {
          out.push({ kind: 'cluster', id: `c:${c.id}`, label: c.name, path: [], cluster: c });
          for (const d of c.databases ?? []) {
            out.push({
              kind: 'database', id: `d:${c.id}/${d.name}`, label: d.name,
              path: [c.name], cluster: c, db: d.name,
            });
            pending.push({ cluster: c, db: d.name });
          }
        }

        const take = pending.slice(0, MAX_DATABASES);
        capped = pending.length > take.length;

        // In parallel: sixty sequential round trips would make the first open
        // feel broken, and these are independent reads.
        const lists = await Promise.all(take.map(async ({ cluster, db }) => {
          try {
            return { cluster, db, collections: await chatApi.listCollections(cluster.id, db) };
          } catch {
            // A database that will not list -- admin and config commonly
            // refuse -- should not lose the rest of the index.
            return { cluster, db, collections: [] };
          }
        }));

        for (const { cluster, db, collections } of lists) {
          for (const coll of collections) {
            out.push({
              kind: 'collection', id: `k:${cluster.id}/${db}/${coll.name}`, label: coll.name,
              path: [cluster.name, db], cluster, db, coll: coll.name,
            });
          }
        }
      } catch {
        // No clusters configured, or the API is unreachable. An empty index
        // simply means the palette shows chats only.
      }

      setEntries(out);
      setTruncated(capped);
      setBuilding(false);
      inFlight.current = null;
      return out;
    })();

    return inFlight.current;
  }, [entries]);

  return { entries, truncated, building, build };
}

/**
 * Entries matching a query, best first.
 *
 * Ranked rather than merely filtered: with clusters, databases and collections
 * in one list, an exact collection name should beat a cluster that happens to
 * contain the same letters. Deeper things rank slightly lower on ties, so the
 * containing database appears above its collections.
 */
export const MIN_QUERY_LENGTH = 2;

export function searchIndex(entries, query, limit = 8) {
  const q = (query ?? '').trim().toLowerCase();
  // The same floor the chat half uses. Without it one character showed
  // cluster hits while the panel was still saying "type at least two
  // characters", which is the panel disagreeing with itself.
  if (q.length < MIN_QUERY_LENGTH || !entries) return [];

  const tokens = q.split(/[^a-z0-9_.-]+/i).filter(Boolean);
  if (!tokens.length) return [];

  const DEPTH = { cluster: 0, database: 1, collection: 2 };

  return entries
    .map((e) => {
      const label = e.label.toLowerCase();
      if (label === q) return { e, score: 0 };
      if (label.startsWith(q)) return { e, score: 1 };
      if (label.includes(q)) return { e, score: 2 };
      // Falls back to the full path, so "incidents fix" finds a collection by
      // the database holding it. Matched token by token rather than as one
      // substring, so the separator the row displays ("corbs-demo /
      // incidents / fix") works as well as plain spaces.
      const hay = [...e.path, e.label].join(' ').toLowerCase();
      if (tokens.every((t) => hay.includes(t))) return { e, score: 3 };
      return null;
    })
    .filter(Boolean)
    .sort((a, b) => (a.score - b.score) || (DEPTH[a.e.kind] - DEPTH[b.e.kind]) || a.e.label.localeCompare(b.e.label))
    .slice(0, limit)
    .map((r) => r.e);
}
