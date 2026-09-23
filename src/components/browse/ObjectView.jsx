import React, { useEffect, useState } from 'react';
import * as chatApi from '../../api/chat.js';
import Icon from '../brand/Icon.jsx';
import JsonView from './JsonView.jsx';
import { formatBytes } from './format.js';
import { objectKind, isTextual, MAX_INLINE_BYTES } from './objectKinds.js';

// One object, shown as whatever it actually is.
//
// Metadata comes first and always. Every object has a size, a type and a
// timestamp; only some can be rendered, and a viewer that shows nothing for a
// zip is worse than one that shows what it knows.
//
// Media is loaded by the element, not by this component: <img>, <video> and
// <audio> are handed the URL and fetch it themselves, which is what lets a
// video seek rather than pulling 45MB before the first frame.

/** "Mon, 14 Sep 2026 16:35:22 GMT" -> the reader's own locale and zone. */
function formatWhen(value) {
  if (!value) return '–';
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleString(undefined, {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
}

export default function ObjectView({ tab }) {
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState(null);
  const [body, setBody] = useState(null);
  const [bodyError, setBodyError] = useState(null);

  const url = chatApi.objectContentUrl(tab.storeId, tab.bucket, tab.key);

  // Metadata first, on its own. The kind decides whether the bytes are worth
  // fetching at all, and the size decides whether they are safe to.
  useEffect(() => {
    let cancelled = false;
    setMeta(null); setError(null); setBody(null); setBodyError(null);
    (async () => {
      try {
        const m = await chatApi.statObject(tab.storeId, tab.bucket, tab.key);
        if (!cancelled) setMeta(m);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    })();
    return () => { cancelled = true; };
  }, [tab.storeId, tab.bucket, tab.key]);

  const kind = meta ? objectKind({ contentType: meta.contentType, key: tab.key }) : null;
  const tooBig = meta ? meta.size > MAX_INLINE_BYTES : false;

  // Only text and JSON are pulled into the page. Images and media are the
  // element's job, and everything else is not fetched at all.
  useEffect(() => {
    if (!meta || !isTextual(kind) || tooBig || meta.size === 0) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`could not read this object (${res.status})`);
        const text = await res.text();
        if (!cancelled) setBody(text);
      } catch (err) {
        if (!cancelled) setBodyError(err.message);
      }
    })();
    return () => { cancelled = true; };
  }, [url, meta, kind, tooBig]);

  if (error) return <p className="browse__note browse__note--error">{error}</p>;
  if (!meta) return <p className="browse__note">Loading…</p>;

  return (
    <div className="browse">
      <header className="browse__head">
        <h2 className="browse__title">{tab.key}</h2>
        <p className="browse__sub">
          {tab.storeName} / {tab.bucket} · {formatBytes(meta.size)}
          {meta.contentType && ` · ${meta.contentType}`}
          {' · '}{formatWhen(meta.lastModified)}
        </p>
      </header>

      <div className="object-view">
        {meta.size === 0 && (
          <p className="browse__note">This object is empty.</p>
        )}

        {meta.size > 0 && kind === 'none' && (
          <p className="browse__note">
            No preview for {meta.contentType || 'this type'}. Its metadata is above.
          </p>
        )}

        {/* Said rather than silently truncated: half a file rendered as if it
            were whole is worse than a refusal. */}
        {meta.size > 0 && isTextual(kind) && tooBig && (
          <p className="browse__note">
            {formatBytes(meta.size)} is too large to preview
            ({formatBytes(MAX_INLINE_BYTES)} limit).
          </p>
        )}

        {bodyError && <p className="browse__note browse__note--error">{bodyError}</p>}

        {body !== null && kind === 'text' && (
          <pre className="object-view__text">{body}</pre>
        )}

        {body !== null && kind === 'json' && <JsonBody text={body} />}

        {meta.size > 0 && kind === 'image' && (
          <img className="object-view__image" src={url} alt={tab.key} />
        )}

        {meta.size > 0 && kind === 'video' && (
          // controls, and nothing else: no autoplay, no preload of a file that
          // may be forty megabytes.
          <video className="object-view__media" src={url} controls preload="metadata" />
        )}

        {meta.size > 0 && kind === 'audio' && (
          <audio className="object-view__media" src={url} controls preload="metadata" />
        )}

        {meta.size > 0 && kind === 'pdf' && (
          <object className="object-view__pdf" data={url} type="application/pdf">
            {/* Shown when the browser has no PDF viewer, rather than an empty
                grey box that looks like a failure. */}
            <p className="browse__note">This browser cannot display PDFs inline.</p>
          </object>
        )}
      </div>
    </div>
  );
}

// JSON that will not parse is still text worth reading -- a truncated or
// hand-edited document should show its contents, not an error page.
function JsonBody({ text }) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return (
      <>
        <p className="browse__note">Not valid JSON — showing it as text.</p>
        <pre className="object-view__text">{text}</pre>
      </>
    );
  }
  return (
    <div className="object-view__json">
      <JsonView value={parsed} />
    </div>
  );
}
