import { describe, it, expect } from 'vitest';
import { readContext, contextFromMessages } from '../../shared/connectionContext.js';

// Imported, not reimplemented. This file used to carry its own copy of the
// inference rules with a comment asking whoever changed the server to change
// them here too, which is how a test ends up asserting behaviour the app no
// longer has.

describe('connection context inference', () => {
  it('learns the connection from connect', () => {
    expect(readContext({}, 'connect', { name: 'atlas' })).toEqual({ connection: 'atlas' });
  });

  // OrbitAI has spelled this argument more than one way across versions.
  it('accepts either spelling of the connect target', () => {
    expect(readContext({}, 'connect', { connection: 'atlas' }).connection).toBe('atlas');
    expect(readContext({}, 'connect', { connectionString: 'atlas' }).connection).toBe('atlas');
  });

  it('accumulates across calls rather than replacing', () => {
    let c = readContext({}, 'connect', { name: 'atlas' });
    c = readContext(c, 'list-collections', { connection: 'atlas', database: 'orbitai' });
    c = readContext(c, 'find', { database: 'orbitai', collection: 'chat_projects' });
    expect(c).toEqual({ connection: 'atlas', database: 'orbitai', collection: 'chat_projects' });
  });

  it('does not clear what a call simply did not mention', () => {
    const before = { connection: 'atlas', database: 'orbitai' };
    expect(readContext(before, 'list-databases', {})).toEqual(before);
    expect(readContext(before, 'list-connections', undefined)).toEqual(before);
  });

  it('ignores empty and non-string arguments', () => {
    const before = { database: 'orbitai' };
    expect(readContext(before, 'find', { database: '' })).toEqual(before);
    expect(readContext(before, 'find', { database: 42 })).toEqual(before);
  });

  // Atlas admin tools carry the project and nothing else. The indicator
  // renders it, so a conversation that only ever ran those is not blank.
  it('reads the Atlas project from path params', () => {
    expect(readContext({}, 'manage_clusters', { action: 'list', params: { groupId: 'abc' } }))
      .toEqual({ groupId: 'abc' });
  });
});

describe('context replayed from a stored transcript', () => {
  // The bug this fixes: context was live-session only, so loading a
  // conversation that had plainly connected showed "not connected yet".
  it('rebuilds what the live session would have shown', () => {
    const messages = [
      { role: 'user', text: 'what is in orbitai?' },
      {
        role: 'assistant',
        retrievals: [
          { tool: 'connect', input: { name: 'atlas' } },
          { tool: 'list-collections', input: { connection: 'atlas', database: 'orbitai' } },
        ],
      },
    ];
    expect(contextFromMessages(messages)).toEqual({ connection: 'atlas', database: 'orbitai' });
  });

  // Transcripts stored before the array existed kept one call in `retrieval`.
  it('reads the legacy single-call shape', () => {
    const messages = [{ role: 'assistant', retrieval: { tool: 'connect', input: { name: 'atlas' } } }];
    expect(contextFromMessages(messages)).toEqual({ connection: 'atlas' });
  });

  it('carries context across turns, latest wins', () => {
    const messages = [
      { role: 'assistant', retrievals: [{ tool: 'connect', input: { name: 'atlas' } }] },
      { role: 'assistant', retrievals: [{ tool: 'find', input: { database: 'incidents' } }] },
      { role: 'assistant', retrievals: [{ tool: 'find', input: { database: 'orbitai' } }] },
    ];
    expect(contextFromMessages(messages)).toEqual({ connection: 'atlas', database: 'orbitai' });
  });

  // Before arguments were stored whole they were a `query` string clipped at
  // 200 characters. Short ones still parse; long ones are cut mid-token and
  // must not be guessed at.
  it('recovers arguments from the legacy query string', () => {
    const messages = [{
      role: 'assistant',
      retrievals: [{ tool: 'find', query: '{"connection":"atlas","database":"orbitai"}' }],
    }];
    expect(contextFromMessages(messages)).toEqual({ connection: 'atlas', database: 'orbitai' });
  });

  it('ignores a legacy query that was truncated mid-token', () => {
    const messages = [{
      role: 'assistant',
      retrievals: [{ tool: 'find', query: '{"connection":"atlas","database":"incid' }],
    }];
    expect(contextFromMessages(messages)).toEqual({});
  });

  it('prefers stored arguments over the legacy string when both exist', () => {
    const messages = [{
      role: 'assistant',
      retrievals: [{ tool: 'find', input: { database: 'new' }, query: '{"database":"old"}' }],
    }];
    expect(contextFromMessages(messages)).toEqual({ database: 'new' });
  });

  it('is empty for a transcript with no tool calls', () => {
    expect(contextFromMessages([{ role: 'user', text: 'hello' }])).toEqual({});
    expect(contextFromMessages([])).toEqual({});
    expect(contextFromMessages(undefined)).toEqual({});
  });
});
