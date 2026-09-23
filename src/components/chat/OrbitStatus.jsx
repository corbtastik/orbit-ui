import React, { useCallback, useEffect, useState } from 'react';
import * as chatApi from '../../api/chat.js';
import { DEFAULT_PROVIDER } from './providers.js';

// Whether OrbitAI can actually answer.
//
// This was a Model dropdown with exactly one option in it -- a control that
// could not change anything, occupying the spot where the one thing worth
// knowing belongs: whether the MCP server on :3600 is up. Without it every
// question fails, and the old UI let you find that out by asking one.
//
// The server already knew. /chat/providers reports `healthy` per provider,
// probed passively by isReachable(), and nothing had ever rendered it.
//
// Reachable is not the same as usable. An MCP server answering pings while
// holding no registered connections fails every data question with `"atlas"
// is not registered` -- and this showed that as "Connected" for a whole
// debugging session before the cause was found. So the count is reported
// too, and zero gets its own state.

// Often enough to notice a restart, rarely enough that an idle tab is not
// making a request every few seconds all day.
const POLL_MS = 20000;

export default function OrbitStatus() {
  // null while the first probe is in flight: "connecting" is honest, where
  // defaulting to either state means showing something untrue for a moment.
  const [healthy, setHealthy] = useState(null);
  // Also null when the count could not be established, which is not the same
  // as a genuine zero and must not be warned about as if it were.
  const [connections, setConnections] = useState(null);

  const probe = useCallback(async () => {
    try {
      const providers = await chatApi.listProviders();
      const orbit = providers.find((p) => p.id === DEFAULT_PROVIDER);
      // Configured but unreachable and not configured at all are both "cannot
      // answer"; the distinction lives in the tooltip rather than the dot.
      setHealthy(Boolean(orbit?.configured && orbit?.healthy));
      setConnections(typeof orbit?.connections === 'number' ? orbit.connections : null);
    } catch {
      // The API itself is unreachable, which also means no answers.
      setHealthy(false);
      setConnections(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = () => { if (!cancelled) probe(); };
    run();

    const timer = setInterval(run, POLL_MS);
    // A tab left in the background for an hour should re-check when it comes
    // back rather than showing an hour-old verdict until the next tick.
    const onVisible = () => { if (document.visibilityState === 'visible') run(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [probe]);

  // Reachable with nothing registered is its own state, between the two. It
  // is not "down" -- the server is answering, and the Atlas admin tools still
  // work -- but no question that reads data can succeed.
  const state =
    healthy === null ? 'probing'
      : !healthy ? 'down'
      : connections === 0 ? 'idle'
      : 'ok';

  const label = {
    probing: 'Connecting…',
    ok: 'Connected',
    idle: 'No databases',
    down: 'Disconnected',
  }[state];

  const title = {
    probing: 'Checking the OrbitAI MCP server…',
    ok:
      connections === null
        ? 'OrbitAI MCP server is reachable'
        : `OrbitAI MCP server is reachable, with ${connections} registered connection${connections === 1 ? '' : 's'}`,
    idle:
      'The MCP server is running but has no registered MongoDB connections, so data questions will fail. ' +
      'Check MONGODB_CONN_* in the orbit repo\u2019s .env, and that its build is current \u2014 a stale dist is the usual cause.',
    down: 'Cannot reach the OrbitAI MCP server \u2014 questions will fail. Start it with ./start-server.sh in the orbit repo.',
  }[state];

  return (
    <div className={`orbit-status orbit-status--${state}`} title={title}>
      <span className="orbit-status__dot" aria-hidden="true" />
      <span className="orbit-status__name">OrbitAI</span>
      {/* The word, not just the colour: a dot alone is unreadable to anyone
          who cannot distinguish the two, and ambiguous to everyone else. */}
      <span className="orbit-status__state">{label}</span>
    </div>
  );
}
