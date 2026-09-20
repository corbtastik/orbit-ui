import { useEffect, useRef } from 'react';

// Application keyboard shortcuts.
//
// Bound on the window rather than on a component, because the point of ⌘K is
// that it works wherever you are -- including from inside the transcript,
// which holds no focusable element at all.
//
// Typing is never intercepted. A shortcut that fires while someone is
// composing a message is worse than no shortcut, so anything with a modifier
// is allowed through and bare keys are ignored in fields entirely.

const isTyping = (el) =>
  !!el && (
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.isContentEditable ||
    // Material Web fields are custom elements with the real input in a shadow
    // root, so the tag name at this level is md-filled-text-field.
    /^MD-(FILLED|OUTLINED)-(TEXT-FIELD|SELECT)$/.test(el.tagName)
  );

/**
 * @param {Record<string, (e: KeyboardEvent) => void>} bindings
 *   Keyed "mod+k" for Cmd/Ctrl, or a bare key like "Escape".
 */
export function useHotkeys(bindings) {
  // Held in a ref so the listener binds once and still calls the current
  // handlers. Depending on `bindings` identity instead would tear down and
  // rebind on every render, and would force every caller to memoise a map
  // whose contents change anyway.
  const latest = useRef(bindings);
  latest.current = bindings;

  useEffect(() => {
    const onKey = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const combo = `${mod ? 'mod+' : ''}${e.shiftKey && mod ? 'shift+' : ''}${key}`;

      const handler = latest.current[combo];
      if (!handler) return;

      // Bare keys stay out of the way of anything being typed into.
      if (!mod && isTyping(document.activeElement)) return;

      e.preventDefault();
      handler(e);
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
