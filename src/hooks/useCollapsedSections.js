import { useCallback, useState } from 'react';

// Which sidebar sections are collapsed, remembered across reloads.
//
// A section you closed once should not reopen every time the page loads --
// the sidebar already remembers its width for the same reason.

const KEY = 'orbit.chat.collapsedSections';

const read = () => {
  try {
    return JSON.parse(window.localStorage.getItem(KEY)) ?? {};
  } catch {
    // Private mode, or a value written by an older shape of this.
    return {};
  }
};

export function useCollapsedSections() {
  const [collapsed, setCollapsed] = useState(read);

  const toggle = useCallback((id) => {
    setCollapsed((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try { window.localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode */ }
      return next;
    });
  }, []);

  // Sections default to open: a collapsed-by-default sidebar hides the thing
  // the reader came for.
  const isOpen = useCallback((id) => !collapsed[id], [collapsed]);

  return { isOpen, toggle };
}
