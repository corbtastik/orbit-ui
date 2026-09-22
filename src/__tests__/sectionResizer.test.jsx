import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import SectionResizer, { SPLIT_MIN, SPLIT_MAX, SPLIT_DEFAULT, clampSplit } from '../components/chat/SectionResizer.jsx';

afterEach(cleanup);

describe('the split between the sidebar panes', () => {
  // A fraction, not a pixel height: a height that suits a tall window leaves
  // the chats pane with nothing on a short one.
  it('stays between its bounds', () => {
    expect(clampSplit(0)).toBe(SPLIT_MIN);
    expect(clampSplit(1)).toBe(SPLIT_MAX);
    expect(clampSplit(0.5)).toBe(0.5);
  });

  it('nudges with the arrow keys and reports itself as a percentage', () => {
    const onResize = vi.fn();
    render(<SectionResizer split={0.4} onResize={onResize} onReset={() => {}} containerRef={{ current: null }} />);
    const bar = screen.getByRole('separator', { name: /resize the clusters and chats panes/i });

    expect(bar.getAttribute('aria-orientation')).toBe('horizontal');
    expect(bar.getAttribute('aria-valuenow')).toBe('40');

    fireEvent.keyDown(bar, { key: 'ArrowDown' });
    expect(onResize).toHaveBeenLastCalledWith(0.45);
    fireEvent.keyDown(bar, { key: 'ArrowUp' });
    expect(onResize).toHaveBeenLastCalledWith(clampSplit(0.35));
  });

  it('will not nudge past its bounds', () => {
    const onResize = vi.fn();
    render(<SectionResizer split={SPLIT_MIN} onResize={onResize} onReset={() => {}} containerRef={{ current: null }} />);
    fireEvent.keyDown(screen.getByRole('separator'), { key: 'ArrowUp' });
    expect(onResize).toHaveBeenLastCalledWith(SPLIT_MIN);
  });

  it('resets on double-click', () => {
    const onReset = vi.fn();
    render(<SectionResizer split={0.7} onResize={() => {}} onReset={onReset} containerRef={{ current: null }} />);
    fireEvent.doubleClick(screen.getByRole('separator'));
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(SPLIT_DEFAULT).toBeGreaterThan(SPLIT_MIN);
  });

  // The width resizer sets `is-resizing`, which forces col-resize. A
  // horizontal drag must not inherit that cursor.
  it('marks the body with its own axis class while dragging', () => {
    render(<SectionResizer split={0.4} onResize={() => {}} onReset={() => {}} containerRef={{ current: { clientHeight: 500 } }} />);
    const bar = screen.getByRole('separator');
    bar.setPointerCapture = vi.fn();
    bar.releasePointerCapture = vi.fn();

    fireEvent.pointerDown(bar, { pointerId: 1, clientY: 100 });
    expect(document.body.classList.contains('is-resizing-rows')).toBe(true);
    expect(document.body.classList.contains('is-resizing')).toBe(false);

    fireEvent.pointerUp(bar, { pointerId: 1 });
    expect(document.body.classList.contains('is-resizing-rows')).toBe(false);
  });
});
