import React, { useCallback, useRef } from 'react';

// The divider between the Clusters pane and the Chats pane.
//
// Same pointer-capture approach as SidebarResizer, turned ninety degrees: one
// code path for trackpad, mouse and touch, and capture keeps the drag alive
// once the pointer outruns the handle, which it always does.
//
// Sized as a fraction of the sidebar rather than in pixels. A pixel height set
// on a tall window leaves the Chats pane with nothing on a short one, and this
// is a split between two panes rather than a measurement of either.

export const SPLIT_MIN = 0.15;
export const SPLIT_MAX = 0.75;
export const SPLIT_DEFAULT = 0.4;

// Rounded as well as clamped. Arrow-key nudges are float arithmetic --
// 0.4 - 0.05 is 0.35000000000000003 -- and that noise would accumulate in the
// value written to localStorage and read back next session.
export const clampSplit = (v) =>
  Math.round(Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, v)) * 1e4) / 1e4;

export default function SectionResizer({ split, onResize, onReset, containerRef }) {
  const startRef = useRef({ y: 0, split: 0, height: 0 });

  const handlePointerDown = useCallback((e) => {
    startRef.current = {
      y: e.clientY,
      split,
      // Measured once at grab rather than per move: the container's height
      // does not change mid-drag, and reading it on every pointermove forces
      // a layout on each one.
      height: containerRef.current?.clientHeight || 1,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    // Its own class: the sidebar's width resizer sets `is-resizing`, which
    // forces a col-resize cursor -- wrong for a divider that moves vertically.
    document.body.classList.add('is-resizing-rows');
  }, [split, containerRef]);

  const handlePointerMove = useCallback((e) => {
    if (!e.currentTarget.hasPointerCapture?.(e.pointerId)) return;
    const { y, split: startSplit, height } = startRef.current;
    onResize(clampSplit(startSplit + (e.clientY - y) / height));
  }, [onResize]);

  const handlePointerUp = useCallback((e) => {
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    document.body.classList.remove('is-resizing-rows');
  }, []);

  // Arrow keys nudge it, in steps small enough to land where you meant.
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'ArrowUp')   { e.preventDefault(); onResize(clampSplit(split - 0.05)); }
    if (e.key === 'ArrowDown') { e.preventDefault(); onResize(clampSplit(split + 0.05)); }
  }, [split, onResize]);

  return (
    <div
      className="chat-side__section-resizer"
      role="separator"
      aria-orientation="horizontal"
      aria-valuenow={Math.round(split * 100)}
      aria-valuemin={Math.round(SPLIT_MIN * 100)}
      aria-valuemax={Math.round(SPLIT_MAX * 100)}
      aria-label="Resize the clusters and chats panes"
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
