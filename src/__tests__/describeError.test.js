import { describe, it, expect } from 'vitest';
import { describeError } from '../../server/lib/describeError.js';

// The routers summarise to the browser on the understanding that the log
// carries the full reason. `err?.message ?? err` broke that silently for the
// most likely failure there is -- an endpoint being down.

describe('describeError', () => {
  // Node's dual-stack connect rejects with an AggregateError whose own
  // .message is "". An empty string is not nullish, so `?? err` does not fall
  // through and the log line came out blank.
  it('unwraps an AggregateError, whose own message is empty', () => {
    const err = new AggregateError([
      new Error('connect ECONNREFUSED ::1:9000'),
      new Error('connect ECONNREFUSED 127.0.0.1:9000'),
    ]);
    expect(err.message).toBe('');
    expect(describeError(err)).toBe(
      'connect ECONNREFUSED ::1:9000; connect ECONNREFUSED 127.0.0.1:9000'
    );
  });

  // A refusal on both stacks says the same thing twice bar the address; when
  // the halves genuinely differ, both are kept.
  it('deduplicates identical nested reasons', () => {
    const err = new AggregateError([new Error('same'), new Error('same')]);
    expect(describeError(err)).toBe('same');
  });

  it('passes an ordinary message through', () => {
    expect(describeError(new Error('AccessDenied (403)'))).toBe('AccessDenied (403)');
  });

  // The code identifies the failure when the message does not carry it.
  it('appends a code the message does not already mention', () => {
    const err = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
    expect(describeError(err)).toBe('socket hang up (ECONNRESET)');
  });

  it('does not repeat a code the message already contains', () => {
    const err = Object.assign(new Error('connect ETIMEDOUT 10.0.0.1:443'), { code: 'ETIMEDOUT' });
    expect(describeError(err)).toBe('connect ETIMEDOUT 10.0.0.1:443');
  });

  it('falls back to the code when there is no message at all', () => {
    expect(describeError(Object.assign(new Error(''), { code: 'ENOTFOUND' }))).toBe('ENOTFOUND');
  });

  // Never empty: a blank log line is the thing this exists to prevent.
  it('never returns an empty string', () => {
    for (const input of [null, undefined, '', {}, new Error(''), 0, false]) {
      expect(describeError(input).length).toBeGreaterThan(0);
    }
  });

  it('takes a string as given', () => {
    expect(describeError('timed out')).toBe('timed out');
  });
});
