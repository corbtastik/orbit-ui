import React from 'react';
import Icon from '../brand/Icon.jsx';

// The sidebar's one way in to search.
//
// A button dressed as a field rather than an actual input: there is a single
// search surface -- the palette -- and two ways to reach it. A real box here
// would be a second one, which is how the sidebar ended up with a chat box
// that could not find a collection and a tree filter that could not find a
// chat.
//
// It carries the shortcut so the palette is discoverable without being
// documented; nobody presses a key combination they have never seen.

export default function SidebarSearch({ onOpen }) {
  return (
    <button type="button" className="sidebar-search" onClick={onOpen}>
      <Icon name="search" size={20} />
      <span className="sidebar-search__label">Search</span>
      <kbd className="sidebar-search__kbd">⌘K</kbd>
    </button>
  );
}
