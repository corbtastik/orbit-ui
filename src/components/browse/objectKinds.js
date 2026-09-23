// What an object can be shown as.
//
// Content-Type first, extension second. MinIO sets the type correctly for
// everything it was given, but `mock-edge` is a reminder not to depend on
// either alone: it holds `no-extension`, `trailing.dots..txt`, a zero-byte
// object and `ünïcödé-ключ-键.txt`.

/** Rendered as text in the tab. Anything larger is offered as metadata only. */
export const MAX_INLINE_BYTES = 2 * 1024 * 1024;

const BY_EXTENSION = {
  txt: 'text', md: 'text', csv: 'text', log: 'text', ini: 'text', yaml: 'text', yml: 'text',
  json: 'json', ndjson: 'text',
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', svg: 'image',
  mp4: 'video', webm: 'video', mov: 'video',
  mp3: 'audio', wav: 'audio', flac: 'audio', m4a: 'audio', ogg: 'audio',
  pdf: 'pdf',
};

// Renders nowhere. TIFF is the trap: it is unmistakably an image, has an
// image/* type, and no browser will display it -- treating it as one shows a
// broken icon and calls that a preview.
const UNRENDERABLE = new Set(['image/tiff', 'image/x-tiff']);

/**
 * How to show this object: 'text' | 'json' | 'image' | 'video' | 'audio' |
 * 'pdf' | 'none'.
 */
export function objectKind({ contentType, key = '' } = {}) {
  const type = (contentType ?? '').split(';')[0].trim().toLowerCase();

  if (UNRENDERABLE.has(type)) return 'none';

  if (type === 'application/json') return 'json';
  if (type === 'application/pdf') return 'pdf';
  if (type.startsWith('text/')) return 'text';
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';

  // application/octet-stream is what a store says when it does not know, which
  // is most of mock-edge. The extension is the only remaining evidence.
  const ext = key.includes('.') ? key.split('.').pop().toLowerCase() : '';
  return BY_EXTENSION[ext] ?? 'none';
}

/** Whether the kind is one this app fetches into the page rather than linking. */
export const isTextual = (kind) => kind === 'text' || kind === 'json';
