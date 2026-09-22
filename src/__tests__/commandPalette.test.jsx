import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import React from 'react';
import { searchIndex } from '../hooks/useBrowseIndex.js';
import CommandPalette from '../components/chat/CommandPalette.jsx';

vi.mock('../api/chat.js', () => ({
  listClusters: async () => ([{ id: 'c1', name: 'corbs-demo', status: 'ok',
    databases: [{ name: 'incidents' }, { name: 'orbitai' }] }]),
  listCollections: async (_c, db) =>
    db === 'incidents' ? [{ name: 'incident_events' }] : [{ name: 'chat_projects' }],
  searchConversations: async () => ([
    { id: 'x1', title: 'About incidents', updatedAt: new Date().toISOString(),
      match: { role: 'user', text: 'the incidents database' } },
  ]),
}));

afterEach(cleanup);

const ENTRIES = [
  { kind: 'cluster',    id: 'c', label: 'corbs-demo',      path: [] },
  { kind: 'database',   id: 'd', label: 'incidents',       path: ['corbs-demo'] },
  { kind: 'collection', id: 'k', label: 'incident_events', path: ['corbs-demo', 'incidents'] },
  { kind: 'collection', id: 'j', label: 'fix_events',      path: ['corbs-demo', 'incidents'] },
];

describe('ranking across the index', () => {
  // An exact name beats a prefix beats a substring. Without this a cluster
  // that merely contains the letters outranks the collection you named.
  it('puts an exact match first', () => {
    expect(searchIndex(ENTRIES, 'incidents')[0].label).toBe('incidents');
  });

  // Ties break by depth, so a database appears above the collections it holds
  // rather than interleaved with them.
  it('breaks ties by depth, shallowest first', () => {
    const kinds = searchIndex(ENTRIES, 'incident').map((e) => e.kind);
    expect(kinds.indexOf('database')).toBeLessThan(kinds.indexOf('collection'));
  });

  // "incidents fix" should find the collection through the database holding
  // it, which only works if the path is searched too.
  it('matches on the full path, not just the label', () => {
    expect(searchIndex(ENTRIES, 'corbs-demo / incidents / fix').map((e) => e.label)).toContain('fix_events');
  });

  it('ignores a query below the minimum', () => {
    expect(searchIndex(ENTRIES, 'i')).toEqual([]);
    expect(searchIndex(null, 'incidents')).toEqual([]);
  });
});

describe('the palette', () => {
  const props = { open: true, onClose: vi.fn(), onOpenTab: vi.fn(), onSelectChat: vi.fn() };

  it('renders nothing while closed', () => {
    const { container } = render(<CommandPalette {...props} open={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('groups cluster hits and chat hits separately', async () => {
    render(<CommandPalette {...props} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'incident' } });
    await waitFor(() => expect(screen.getByText('Clusters')).toBeTruthy());
    await waitFor(() => expect(screen.getByText('Chats')).toBeTruthy());
  });

  // Enter on a collection opens it as a tab; the palette closes behind it.
  it('opens a collection tab on Enter', async () => {
    const onOpenTab = vi.fn();
    const onClose = vi.fn();
    render(<CommandPalette {...props} onOpenTab={onOpenTab} onClose={onClose} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'incident_events' } });
    await waitFor(() => expect(screen.getByText('incident_events')).toBeTruthy());

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onOpenTab).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'collection', db: 'incidents', coll: 'incident_events',
    }));
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<CommandPalette {...props} onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  // The arrow keys run through both groups as one list, so the caller never
  // has to know which group the cursor is in.
  it('moves the cursor across both groups', async () => {
    const { container } = render(<CommandPalette {...props} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'incident' } });
    await waitFor(() => expect(container.querySelectorAll('.palette__row').length).toBeGreaterThan(1));

    const active = () => [...container.querySelectorAll('.palette__row')]
      .findIndex((r) => r.className.includes('--active'));
    expect(active()).toBe(0);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(active()).toBe(1);
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(active()).toBe(0);
  });
});
