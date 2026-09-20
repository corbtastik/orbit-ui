import { describe, it, expect } from 'vitest';

// The search route builds a case-insensitive regex from raw user input. These
// cover the two things that make that safe and useful: escaping, so a query
// containing regex syntax cannot throw or match wildly, and substring
// matching, which is why this is a regex rather than a $text index.
//
// Mirrors the expression in server/routes/chat.js. Kept in step by hand --
// the server is ESM under node and not imported here, so if that line changes
// this one must too.
const escape = (q) => q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const rx = (q) => new RegExp(escape(q), 'i');

describe('search query escaping', () => {
  it('does not throw on input that is invalid regex syntax', () => {
    for (const q of ['a(b', '[', '*', '+', '?', 'a|b', '\\', '^$']) {
      expect(() => rx(q)).not.toThrow();
    }
  });

  it('treats metacharacters as literals', () => {
    // Unescaped, "c.rbs" would match "corbs". It must not.
    expect(rx('c.rbs').test('corbs-demo')).toBe(false);
    expect(rx('c.rbs').test('c.rbs')).toBe(true);
    // Unescaped, "*" alone is a syntax error; "a*" would match "".
    expect(rx('a*').test('bbb')).toBe(false);
    expect(rx('a*').test('a*b')).toBe(true);
  });

  it('matches substrings and is case-insensitive', () => {
    // The reason this is not a $text index: people search fragments and
    // hyphenated identifiers, which word-stemming would miss.
    expect(rx('corbs-').test('the corbs-demo cluster')).toBe(true);
    expect(rx('CLUSTER').test('the corbs-demo cluster')).toBe(true);
    expect(rx('ncident').test('incidents')).toBe(true);
  });
});
