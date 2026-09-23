import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import ChatListItem from '../components/chat/ChatListItem.jsx';

// The Material list item and dialog do not finish upgrading under jsdom, so
// this file adds to the suite's unhandled-error noise. React still emits the
// elements and attaches the listeners, so the menu's behaviour is testable.

afterEach(cleanup);

const conversation = {
  id: 'c1',
  title: 'Incidents in Los Angeles',
  updatedAt: new Date().toISOString(),
  provider: 'orbit',
};

const props = { conversation, active: false, onSelect: () => {}, onRename: () => {} };

const row = (container) => container.querySelector('.chat-side__row');
const menu = (container) => container.querySelector('.ctxmenu');

describe('right-clicking a chat', () => {
  it('shows no menu until asked', () => {
    const { container } = render(<ChatListItem {...props} />);
    expect(menu(container)).toBeNull();
  });

  // Renaming existed from the first commit but was reachable only through the
  // move-to-project menu, which is not where anyone looks for it.
  it('offers Rename', () => {
    const { container } = render(<ChatListItem {...props} />);
    fireEvent.contextMenu(row(container));
    expect(menu(container)).toBeTruthy();
    expect(screen.getByText('Rename')).toBeTruthy();
  });

  // Right-clicking to rename should not also load the conversation, which on
  // a long transcript is a visible pause for an action that never needed it.
  it('does not select the chat', () => {
    const onSelect = vi.fn();
    const { container } = render(<ChatListItem {...props} onSelect={onSelect} />);
    fireEvent.contextMenu(row(container));
    expect(onSelect).not.toHaveBeenCalled();
  });

  // Choosing Rename dismisses the menu and hands over to the dialog. That the
  // dialog then *opens* is deliberately not asserted: md-dialog does not
  // upgrade under jsdom, so the `open` property @lit/react assigns never takes
  // effect there. Verified in a browser instead.
  it('closes the menu when Rename is chosen', () => {
    const { container } = render(<ChatListItem {...props} />);
    fireEvent.contextMenu(row(container));
    expect(menu(container)).toBeTruthy();

    fireEvent.click(screen.getByText('Rename'));
    expect(menu(container)).toBeNull();
  });

  // The dialog is in the tree either way, so the handover has somewhere to go.
  it('renders the rename dialog to hand over to', () => {
    const { container } = render(<ChatListItem {...props} />);
    expect(container.querySelector('md-dialog')).toBeTruthy();
  });

  it('closes on Escape without renaming', () => {
    const onRename = vi.fn();
    const { container } = render(<ChatListItem {...props} onRename={onRename} />);
    fireEvent.contextMenu(row(container));
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(menu(container)).toBeNull();
    expect(onRename).not.toHaveBeenCalled();
  });

  it('closes on a click elsewhere', () => {
    const { container } = render(<ChatListItem {...props} />);
    fireEvent.contextMenu(row(container));
    fireEvent.pointerDown(document.body);
    expect(menu(container)).toBeNull();
  });

  // A caller that cannot rename -- the search results list passes no handler
  // -- gets the entry disabled rather than a menu that does nothing.
  it('disables Rename when no handler was given', () => {
    const { container } = render(<ChatListItem {...props} onRename={undefined} />);
    fireEvent.contextMenu(row(container));
    expect(screen.getByText('Rename').closest('button').disabled).toBe(true);
  });
});
