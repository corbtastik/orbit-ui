import { describe, it, expect } from 'vitest';
import { relativeTime, DEFAULT_PROJECT } from '../components/chat/conversations.js';
import { providerLabel, PROVIDERS, DEFAULT_PROVIDER } from '../components/chat/providers.js';

const AT = new Date('2026-01-01T12:00:00Z');
const ago = (ms) => new Date(AT.getTime() - ms).toISOString();

describe('relativeTime', () => {
  it('reads as a rough age, not a date', () => {
    expect(relativeTime(ago(10 * 1000), AT.getTime())).toBe('now');
    expect(relativeTime(ago(45 * 1000), AT.getTime())).toBe('1m');
    expect(relativeTime(ago(5 * 60000), AT.getTime())).toBe('5m');
    expect(relativeTime(ago(3 * 3600_000), AT.getTime())).toBe('3h');
    expect(relativeTime(ago(2 * 86400_000), AT.getTime())).toBe('2d');
  });

  it('falls back to a date once the age stops being useful', () => {
    expect(relativeTime(ago(30 * 86400_000), AT.getTime())).toMatch(/\w/);
  });

  // The sidebar renders whatever the API returns, so a bad timestamp has to
  // produce an empty label rather than "NaNm" or a thrown render.
  it('survives a timestamp it cannot parse', () => {
    expect(relativeTime('not a date', AT.getTime())).toBe('');
    expect(relativeTime(undefined, AT.getTime())).toBe('');
  });
});

describe('providers', () => {
  it('offers a provider that actually exists', () => {
    expect(PROVIDERS.some((p) => p.id === DEFAULT_PROVIDER)).toBe(true);
  });

  // Conversations stored under a provider that is no longer offered still
  // have to render, so the label falls back to the id rather than blanking.
  it('labels an unknown provider rather than dropping it', () => {
    expect(providerLabel('orbit')).toBe('OrbitAI');
    expect(providerLabel('retired-provider')).toBe('retired-provider');
    expect(providerLabel(undefined)).toBe('unknown');
  });
});

describe('project sentinel', () => {
  // A field that is sometimes an ObjectId and sometimes absent is awkward to
  // query; unfiled conversations carry a literal instead.
  it('is a value, not an absence', () => {
    expect(DEFAULT_PROJECT).toBe('default');
  });
});
