import { describe, it, expect } from 'vitest';
import { objectKind, isTextual, MAX_INLINE_BYTES } from '../components/browse/objectKinds.js';

// What decides whether an object is rendered, and as what. Getting this wrong
// is visible: a broken image icon presented as a preview, or a 40MB binary
// pulled into a <pre>.

describe('objectKind', () => {
  it('trusts the content type when there is one', () => {
    expect(objectKind({ contentType: 'application/json', key: 'a.json' })).toBe('json');
    expect(objectKind({ contentType: 'image/png', key: 'a.png' })).toBe('image');
    expect(objectKind({ contentType: 'video/mp4', key: 'v.mp4' })).toBe('video');
    expect(objectKind({ contentType: 'audio/mpeg', key: 'a.mp3' })).toBe('audio');
    expect(objectKind({ contentType: 'application/pdf', key: 'd.pdf' })).toBe('pdf');
  });

  // The trap. TIFF is unmistakably an image, carries an image/* type, and no
  // browser will render it -- calling it an image shows a broken icon and
  // presents that as a preview. There are five in mock-images.
  it('refuses image types no browser can render', () => {
    expect(objectKind({ contentType: 'image/tiff', key: 'a.tiff' })).toBe('none');
  });

  // application/octet-stream is what a store says when it does not know, so
  // the extension is the only evidence left.
  it('falls back to the extension when the type is unknown', () => {
    expect(objectKind({ contentType: 'application/octet-stream', key: 'notes.txt' })).toBe('text');
    expect(objectKind({ contentType: 'application/octet-stream', key: 'x.bin' })).toBe('none');
  });

  // Every one of these is a real key in mock-edge.
  it('handles the awkward keys', () => {
    expect(objectKind({ contentType: 'text/plain', key: 'trailing.dots..txt' })).toBe('text');
    expect(objectKind({ contentType: 'text/plain', key: 'no-extension' })).toBe('text');
    expect(objectKind({ contentType: 'application/octet-stream', key: 'zero-byte-object' })).toBe('none');
    expect(objectKind({ contentType: undefined, key: 'ünïcödé-ключ-键.txt' })).toBe('text');
  });

  // "application/json; charset=utf-8" is still JSON.
  it('ignores charset parameters', () => {
    expect(objectKind({ contentType: 'text/plain; charset=utf-8', key: 'a' })).toBe('text');
    expect(objectKind({ contentType: 'application/json; charset=utf-8', key: 'a' })).toBe('json');
  });

  it('says none rather than guessing when it has nothing', () => {
    expect(objectKind({})).toBe('none');
    expect(objectKind()).toBe('none');
  });

  // Only these are pulled into the page; media is the element's job.
  it('marks only text and json as fetched inline', () => {
    expect(isTextual('text')).toBe(true);
    expect(isTextual('json')).toBe(true);
    for (const k of ['image', 'video', 'audio', 'pdf', 'none']) {
      expect(isTextual(k)).toBe(false);
    }
  });

  // Small enough that a refusal is rare, small enough that nothing large is
  // rendered into a <pre>.
  it('caps inline text well below the largest objects in play', () => {
    expect(MAX_INLINE_BYTES).toBe(2 * 1024 * 1024);
    expect(MAX_INLINE_BYTES).toBeLessThan(45_101_803);
  });
});
