import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, act } from '@testing-library/react';
import React from 'react';
import OrbitStatus from '../components/chat/OrbitStatus.jsx';

// The indicator that replaced a Model dropdown with one option in it. What it
// reports is the MCP server's reachability, which is the difference between
// the app answering questions and every question failing.

let providers;
vi.mock('../api/chat.js', () => ({
  listProviders: async () => {
    if (providers === 'throw') throw new Error('API unreachable');
    return providers;
  },
}));

afterEach(cleanup);

// Plain <div>/<span>, no Material elements, so unlike most of this app's
// chrome it renders under jsdom.
const state = (c) => c.querySelector('.orbit-status').className;

describe('OrbitStatus', () => {
  it('reports connected when the MCP server is reachable', async () => {
    providers = [{ id: 'orbit', configured: true, healthy: true, connections: 2 }];
    const { container } = render(<OrbitStatus />);
    await waitFor(() => expect(state(container)).toContain('orbit-status--ok'));
    expect(screen.getByText('Connected')).toBeTruthy();
  });

  // Reachable with nothing registered is its own state. Not "down" -- the
  // server answers and the Atlas admin tools still work -- but no question
  // that reads data can succeed. This showed as "Connected" for a whole
  // debugging session before the cause was found.
  it('distinguishes reachable-but-empty from connected', async () => {
    providers = [{ id: 'orbit', configured: true, healthy: true, connections: 0 }];
    const { container } = render(<OrbitStatus />);
    await waitFor(() => expect(state(container)).toContain('orbit-status--idle'));
    expect(screen.getByText('No databases')).toBeTruthy();
  });

  // null means the count could not be established, which is not a zero and
  // must not be warned about as if it were.
  it('treats an unknown count as connected, not empty', async () => {
    providers = [{ id: 'orbit', configured: true, healthy: true, connections: null }];
    const { container } = render(<OrbitStatus />);
    await waitFor(() => expect(state(container)).toContain('orbit-status--ok'));
    expect(screen.queryByText('No databases')).toBeNull();
  });

  // An older API that does not report the field at all still reads as
  // connected rather than falsely warning.
  it('tolerates an API that omits the field', async () => {
    providers = [{ id: 'orbit', configured: true, healthy: true }];
    const { container } = render(<OrbitStatus />);
    await waitFor(() => expect(state(container)).toContain('orbit-status--ok'));
  });

  // Unreachable outranks the count: a dead server reporting zero is down,
  // not idle.
  it('reports down even when a count is present', async () => {
    providers = [{ id: 'orbit', configured: true, healthy: false, connections: 0 }];
    const { container } = render(<OrbitStatus />);
    await waitFor(() => expect(state(container)).toContain('orbit-status--down'));
  });

  // The case the old dropdown hid: configured, but nothing is listening on
  // :3600, so every question would fail.
  it('reports disconnected when it is not', async () => {
    providers = [{ id: 'orbit', configured: true, healthy: false }];
    const { container } = render(<OrbitStatus />);
    await waitFor(() => expect(state(container)).toContain('orbit-status--down'));
    expect(screen.getByText('Disconnected')).toBeTruthy();
  });

  // Unconfigured and unreachable are both "cannot answer". The dot does not
  // try to tell them apart; the tooltip does.
  it('treats unconfigured as disconnected', async () => {
    providers = [{ id: 'orbit', configured: false, healthy: true }];
    const { container } = render(<OrbitStatus />);
    await waitFor(() => expect(state(container)).toContain('orbit-status--down'));
  });

  // The API being down also means no answers, so it reads the same rather
  // than leaving the indicator stuck on "Connecting…".
  it('reports disconnected when the API itself fails', async () => {
    providers = 'throw';
    const { container } = render(<OrbitStatus />);
    await waitFor(() => expect(state(container)).toContain('orbit-status--down'));
  });

  // A real third state, not a flash: claiming either answer before the first
  // probe lands would be a guess.
  it('starts in a probing state rather than guessing', () => {
    providers = [{ id: 'orbit', configured: true, healthy: true }];
    const { container } = render(<OrbitStatus />);
    expect(state(container)).toContain('orbit-status--probing');
    expect(screen.getByText('Connecting…')).toBeTruthy();
  });

  // The word carries the meaning; colour alone fails anyone who cannot
  // distinguish the two hues.
  it('names the state in text, not only in colour', async () => {
    providers = [{ id: 'orbit', configured: true, healthy: false }];
    const { container } = render(<OrbitStatus />);
    await waitFor(() => expect(state(container)).toContain('--down'));
    expect(container.textContent).toContain('OrbitAI');
    expect(container.textContent).toContain('Disconnected');
  });
});
