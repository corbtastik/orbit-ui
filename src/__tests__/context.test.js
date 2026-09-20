import { describe, it, expect } from 'vitest';

// Mirrors readContext in server/providers/orbit.js. The server module is ESM
// under node and not imported here, so this is kept in step by hand -- if the
// inference rules change there, they change here too.
//
// The behaviour that matters is that context only ever ADDS. A call that names
// a database does not mean the cluster changed, and a call with no database
// argument does not mean the database was cleared: the absence of an argument
// is not a change of context, and treating it as one would make the header
// flicker empty every time a tool took no arguments.
function readContext(previous, toolName, input) {
  const next = { ...previous };
  const args = input ?? {};
  if (toolName === 'connect') {
    const target = args.name ?? args.connection ?? args.connectionString;
    if (typeof target === 'string' && target) next.connection = target;
  }
  if (typeof args.connection === 'string' && args.connection) next.connection = args.connection;
  if (typeof args.database === 'string' && args.database) next.database = args.database;
  if (typeof args.collection === 'string' && args.collection) next.collection = args.collection;
  const groupId = args.params?.groupId;
  if (typeof groupId === 'string' && groupId) next.groupId = groupId;
  return next;
}

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

  it('reads the Atlas project from path params', () => {
    expect(readContext({}, 'manage_clusters', { action: 'list', params: { groupId: 'abc' } }))
      .toEqual({ groupId: 'abc' });
  });
});
