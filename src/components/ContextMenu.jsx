import React, { useCallback, useEffect, useRef } from 'react';

// A menu at the pointer.
//
// Not md-menu: that anchors to an element, and a context menu belongs where
// the pointer is. Extracted when the second one appeared -- the tab bar and
// the chat list need identical dismissal, and two copies of "close on Escape,
// outside click, scroll, resize and blur" is how two menus quietly stop
// behaving the same way.
//
// The caller owns the open state and the items; this owns position and
// dismissal.

// Used to clamp inside the viewport before the menu has been measured.
const WIDTH = 220;
const HEIGHT_PER_ITEM = 40;
const PADDING = 16;

/**
 * @param {{x: number, y: number}} at      where the pointer was
 * @param {() => void}             onClose
 * @param {number}                 items   how many entries, for clamping
 */
export default function ContextMenu({ at, onClose, items = 2, children }) {
  const ref = useRef(null);
  const close = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    const onKey = (e) => {
      // Stopped so a menu opened over something with its own Escape handler
      // does not also close that.
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
    };
    const onDown = (e) => { if (!ref.current?.contains(e.target)) close(); };

    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);
    // Capture, so scrolling any container underneath counts -- the sidebar and
    // the tab bar both scroll, and a menu left behind points at nothing.
    document.addEventListener('scroll', close, true);

    // contextmenu fires for Shift+F10 too, so the keyboard has to be able to
    // reach what it opened.
    ref.current?.querySelector('button:not([disabled])')?.focus();

    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('blur', close);
      document.removeEventListener('scroll', close, true);
    };
  }, [close]);

  const height = items * HEIGHT_PER_ITEM + PADDING;

  return (
    <div
      ref={ref}
      className="ctxmenu"
      role="menu"
      // Clamped: a right-click near an edge would otherwise put the menu off
      // screen, where it is unreachable and looks like nothing happened.
      style={{
        left: Math.max(4, Math.min(at.x, window.innerWidth - WIDTH - 8)),
        top: Math.max(4, Math.min(at.y, window.innerHeight - height - 8)),
      }}
    >
      {children}
    </div>
  );
}

/** One entry. Disabled rather than hidden, so the menu keeps its shape. */
export function ContextMenuItem({ children, disabled, onClick, title }) {
  return (
    <button
      type="button"
      role="menuitem"
      className="ctxmenu__item"
      disabled={disabled}
      title={title}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
