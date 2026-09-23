import { describe, it, expect } from 'vitest';
import { afterCloseRight } from '../components/browse/tabs.js';

const T = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];

describe('closing tabs to the right', () => {
  it('keeps the tab it was asked about and drops the rest', () => {
    expect(afterCloseRight(T, 'b', 'a').tabs.map((t) => t.id)).toEqual(['a', 'b']);
  });

  // Chat is index -1: always first, never closable, so everything is to the
  // right of it.
  it('closes every browse tab from Chat', () => {
    const next = afterCloseRight(T, 'chat', 'chat');
    expect(next.tabs).toEqual([]);
    expect(next.activeId).toBe('chat');
  });

  // Closing tabs to the right of something else should not move you.
  it('leaves the active tab alone when it survives', () => {
    expect(afterCloseRight(T, 'c', 'b').activeId).toBe('b');
    expect(afterCloseRight(T, 'c', 'c').activeId).toBe('c');
  });

  // The view cannot stay on a tab that no longer exists.
  it('falls back to Chat when the active tab was closed', () => {
    expect(afterCloseRight(T, 'b', 'd').activeId).toBe('chat');
  });

  it('leaves Chat selected whatever is closed', () => {
    expect(afterCloseRight(T, 'b', 'chat').activeId).toBe('chat');
  });

  // The last tab has nothing to its right; the menu disables the item, and
  // this is the second line of defence.
  it('changes nothing for the last tab', () => {
    const next = afterCloseRight(T, 'd', 'd');
    expect(next.changed).toBe(false);
    expect(next.tabs).toHaveLength(4);
  });

  // findIndex returning -1 would make the cut 0 and close everything. A tab
  // that has already gone must do nothing at all.
  it('does nothing for an id that is no longer open', () => {
    const next = afterCloseRight(T, 'gone', 'b');
    expect(next.changed).toBe(false);
    expect(next.tabs).toHaveLength(4);
    expect(next.activeId).toBe('b');
  });

  it('handles an empty bar', () => {
    const next = afterCloseRight([], 'chat', 'chat');
    expect(next.tabs).toEqual([]);
    expect(next.changed).toBe(false);
  });
});
