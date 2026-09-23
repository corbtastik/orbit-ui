// Tab-bar arithmetic, kept out of App so it can be tested.
//
// App renders seven Material components, none of which construct under jsdom,
// so anything left inline there is verified only in a browser. This is exactly
// the kind of off-by-one that fails quietly.

/**
 * What remains after "close tabs to the right" of `id`.
 *
 * Chat is index -1 rather than a special case: it is always first and never
 * closable, so everything is to the right of it.
 *
 * Returns the surviving tabs and which one to look at. The active tab only
 * falls back to Chat if it was one of the closed ones -- closing tabs to the
 * right of something else should not move you.
 */
export function afterCloseRight(tabs, id, activeId) {
  const cut = id === 'chat' ? 0 : tabs.findIndex((t) => t.id === id) + 1;

  // findIndex returning -1 makes cut 0, which would close everything on an id
  // that is no longer there. Doing nothing is the right answer for a tab that
  // has already gone.
  if (id !== 'chat' && cut === 0) return { tabs, activeId, changed: false };

  const kept = tabs.slice(0, cut);
  const stillOpen = activeId === 'chat' || kept.some((t) => t.id === activeId);

  return {
    tabs: kept,
    activeId: stillOpen ? activeId : 'chat',
    changed: kept.length !== tabs.length,
  };
}
