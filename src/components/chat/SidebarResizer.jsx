import React, { useCallback, useRef } from 'react';

export const SIDEBAR_MIN = 200;
export const SIDEBAR_MAX = 480;
export const SIDEBAR_DEFAULT = 260;

export function clampSidebarWidth(px) {
  return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(px)));
}

// Pointer events rather than mouse events: one code path covers trackpad,
// mouse and touch, and setPointerCapture keeps the drag alive when the
// pointer outruns the 3px handle -- which it always does.
export default function SidebarResizer({ width, onResize, onReset }) {
  const startRef = useRef({ x: 0, width: 0 });

  const handlePointerDown = useCallback((e) => {
    startRef.current = { x: e.clientX, width };
    e.currentTarget.setPointerCapture(e.pointerId);
    // Without this, dragging over the transcript selects text as it goes.
    document.body.classList.add('is-resizing');
  }, [width]);

  const handlePointerMove = useCallback((e) => {
    if (!e.currentTarget.hasPointerCapture?.(e.pointerId)) return;
    const { x, width: startWidth } = startRef.current;
    onResize(clampSidebarWidth(startWidth + (e.clientX - x)));
  }, [onResize]);

  const handlePointerUp = useCallback((e) => {
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    document.body.classList.remove('is-resizing');
  }, []);

  // Arrow keys nudge the divider. data-owns-keys tells ViewNavigator to keep
  // its hands off, or the same press would also jump to the next view.
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'ArrowLeft')  { e.preventDefault(); onResize(clampSidebarWidth(width - 16)); }
    if (e.key === 'ArrowRight') { e.preventDefault(); onResize(clampSidebarWidth(width + 16)); }
  }, [width, onResize]);

  return (
    <div
      className="chat-side__resizer"
      role="separator"
      aria-orientation="vertical"
      aria-valuenow={width}
      aria-valuemin={SIDEBAR_MIN}
      aria-valuemax={SIDEBAR_MAX}
      aria-label="Resize sidebar"
      tabIndex={0}
      data-owns-keys="true"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={onReset}
      onKeyDown={handleKeyDown}
      title="Drag to resize · double-click to reset"
    />
  );
}
