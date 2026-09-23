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
    providers = [{ id: 'orbit', configured: true, healthy: true }];
    const { container } = render(<OrbitStatus />);
    await waitFor(() => expect(state(container)).toContain('orbit-status--ok'));
    expect(screen.getByText('Connected')).toBeTruthy();
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
