import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import TabBar from '../components/browse/TabBar.jsx';

// md-icon-button does not finish upgrading under jsdom, so this file adds to
// the suite's unhandled-error noise. React still emits the elements and still
// attaches the listeners, so the menu's behaviour is testable.

afterEach(cleanup);

const TABS = [
  { id: 'db:c1/incidents', kind: 'database', clusterName: 'corbs-demo', db: 'incidents' },
  { id: 'coll:c1/incidents/fix_events', kind: 'collection', db: 'incidents', coll: 'fix_events' },
  { id: 'bucket:s1/mock-json', kind: 'bucket', storeName: 'localdev', bucket: 'mock-json' },
];

const props = { tabs: TABS, activeId: 'chat', onSelect: () => {}, onClose: () => {}, onCloseRight: () => {} };

const openMenuOn = (container, label) => {
  const tab = [...container.querySelectorAll('.tabbar__tab')]
    .find((el) => el.textContent.includes(label));
  fireEvent.contextMenu(tab);
  return container.querySelector('.tabmenu');
};

describe('the tab context menu', () => {
  it('does not exist until a tab is right-clicked', () => {
    const { container } = render(<TabBar {...props} />);
    expect(container.querySelector('.tabmenu')).toBeNull();
  });

  it('opens on right-click', () => {
    const { container } = render(<TabBar {...props} />);
    expect(openMenuOn(container, 'fix_events')).toBeTruthy();
    expect(screen.getByText('Close')).toBeTruthy();
    expect(screen.getByText('Close tabs to the right')).toBeTruthy();
  });

  // Right-clicking to close something should not first navigate to it -- you
  // may be closing it precisely because you do not want to look at it.
  it('does not select the tab it was opened on', () => {
    const onSelect = vi.fn();
    const { container } = render(<TabBar {...props} onSelect={onSelect} />);
    openMenuOn(container, 'fix_events');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('closes the tab it was opened on', () => {
    const onClose = vi.fn();
    const { container } = render(<TabBar {...props} onClose={onClose} />);
    openMenuOn(container, 'fix_events');
    fireEvent.click(screen.getByText('Close'));
    expect(onClose).toHaveBeenCalledWith('coll:c1/incidents/fix_events');
  });

  it('asks to close everything after that tab', () => {
    const onCloseRight = vi.fn();
    const { container } = render(<TabBar {...props} onCloseRight={onCloseRight} />);
    openMenuOn(container, 'incidents');
    fireEvent.click(screen.getByText('Close tabs to the right'));
    expect(onCloseRight).toHaveBeenCalledWith('db:c1/incidents');
  });

  // Nothing is to the right of the last tab, so the item is shown disabled
  // rather than removed -- a menu that changes shape between right-clicks
  // explains nothing by the absence.
  it('disables close-to-the-right on the last tab', () => {
    const { container } = render(<TabBar {...props} />);
    openMenuOn(container, 'mock-json');
    expect(screen.getByText('Close tabs to the right').closest('button').disabled).toBe(true);
  });

  // Chat is the application, not something opened alongside it.
  it('disables Close on the Chat tab but allows closing the rest', () => {
    const { container } = render(<TabBar {...props} />);
    openMenuOn(container, 'Chat');
    expect(screen.getByText('Close').closest('button').disabled).toBe(true);
    expect(screen.getByText('Close tabs to the right').closest('button').disabled).toBe(false);
  });

  it('closes on Escape', () => {
    const { container } = render(<TabBar {...props} />);
    openMenuOn(container, 'fix_events');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(container.querySelector('.tabmenu')).toBeNull();
  });

  it('closes when a choice is made', () => {
    const { container } = render(<TabBar {...props} />);
    openMenuOn(container, 'fix_events');
    fireEvent.click(screen.getByText('Close'));
    expect(container.querySelector('.tabmenu')).toBeNull();
  });

  it('closes on a click outside it', () => {
    const { container } = render(<TabBar {...props} />);
    openMenuOn(container, 'fix_events');
    fireEvent.pointerDown(document.body);
    expect(container.querySelector('.tabmenu')).toBeNull();
  });
});
