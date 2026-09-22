import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import React from 'react';
import ChatSidebar from '../components/chat/ChatSidebar.jsx';

// No clearing needed, and none possible: jsdom supplies a bare object for
// window.localStorage with no getItem or setItem, so every access throws and
// the app's own try/catch swallows it. Persistence therefore does not operate
// under test -- which keeps these isolated, and also means the persistence
// itself is only exercised in a real browser.
afterEach(cleanup);

const props = {
  projects: [], conversations: [], activeId: null, collapsed: false,
  onToggleCollapsed() {}, onSelect() {}, onNewChat() {}, onCreateProject() {},
  onDelete() {}, onMove() {}, width: 260, onOpenSearch() {},
};

describe('the sidebar panes', () => {
  const resizer = (c) => c.querySelector('.chat-side__section-resizer');
  const clusters = (c) => c.querySelector('.chat-side__pane--clusters');

  // The divider used to require both panes expanded, so collapsing Clusters
  // made it vanish -- which reads as a broken handle rather than a deliberate
  // one, and was reported as exactly that.
  it('keeps the divider whichever sections are collapsed', () => {
    const { container } = render(<ChatSidebar {...props} />);
    expect(resizer(container)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Clusters' }));
    expect(resizer(container)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Chats' }));
    expect(resizer(container)).toBeTruthy();
  });

  // Expanded it holds the split; collapsed it takes its header's height so
  // Chats gets the rest, rather than 40% of empty space.
  it('sizes the clusters pane only while it is expanded', () => {
    const { container } = render(<ChatSidebar {...props} />);
    expect(clusters(container).getAttribute('style')).toContain('flex');

    fireEvent.click(screen.getByRole('button', { name: 'Clusters' }));
    expect(clusters(container).getAttribute('style')).toBe('');

    fireEvent.click(screen.getByRole('button', { name: 'Clusters' }));
    expect(clusters(container).getAttribute('style')).toContain('flex');
  });

  // Dragging is a request for room, so it opens a collapsed Clusters rather
  // than growing a pane with nothing in it.
  it('expands a collapsed Clusters when the divider is nudged', () => {
    const { container } = render(<ChatSidebar {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Clusters' }));
    expect(clusters(container).getAttribute('style')).toBe('');

    fireEvent.keyDown(resizer(container), { key: 'ArrowDown' });
    expect(clusters(container).getAttribute('style')).toContain('flex');
  });
});

// The sidebar had two boxes that each searched half the app: a chat box that
// could not find a collection, and a tree filter that could not find a chat.
// Both are now one button onto the palette, which searches both.
describe('the sidebar search', () => {
  const open = () => screen.getByRole('button', { name: /Search/ });

  it('opens the palette rather than searching in place', () => {
    let opened = 0;
    render(<ChatSidebar {...props} onOpenSearch={() => { opened += 1; }} />);

    fireEvent.click(open());
    expect(opened).toBe(1);
  });

  // The collapsed rail carries the same control, but it is an md-icon-button
  // and jsdom cannot construct one: ElementInternals has no setFormValue
  // there, so @material/web's form-associated mixin throws in the constructor
  // and the whole rail renders empty. That is the source of this file's
  // pre-existing unhandled errors too. Verified in a browser instead.

  // It shows the shortcut because nobody presses a key combination they have
  // never seen.
  it('advertises the shortcut', () => {
    const { container } = render(<ChatSidebar {...props} />);
    expect(container.querySelector('.sidebar-search__kbd').textContent).toBe('\u2318K');
  });
});
