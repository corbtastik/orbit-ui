import React, { useState } from 'react';
import Icon from '../brand/Icon.jsx';

// A collapsible Extended JSON viewer.
//
// The server sends canonical EJSON, so an ObjectId arrives as {"$oid": ...}
// and a Date as {"$date": ...}. Those render as collapsed nodes rather than
// being flattened to strings -- flattening them would make a real Date
// indistinguishable from a string that happens to look like one, which is the
// single most useful thing this view tells you about a document.

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isBranch = (v) => isObject(v) || Array.isArray(v);

/** Objects and arrays open at the root and stay shut below it. */
export const OPEN_TO_DEPTH = 1;

/** What "expand all" passes for openDepth. */
export const OPEN_ALL = Number.POSITIVE_INFINITY;

function Leaf({ value }) {
  if (value === null) return <span className="json__null">null</span>;
  switch (typeof value) {
    case 'string':
      return <span className="json__string">"{value}"</span>;
    case 'number':
      return <span className="json__number">{value}</span>;
    case 'boolean':
      return <span className="json__boolean">{String(value)}</span>;
    default:
      return <span className="json__null">{String(value)}</span>;
  }
}

function Node({ name, value, depth, isLast, openDepth }) {
  // openDepth seeds this and nothing more -- once a row is rendered its own
  // toggle owns it. Changing openDepth from outside therefore has to remount
  // the tree, which is what the key in JsonView is for.
  const [open, setOpen] = useState(depth < openDepth);
  const comma = isLast ? '' : ',';

  const label = name === undefined ? null : (
    <>
      <span className="json__key">"{name}"</span>
      <span className="json__punct">: </span>
    </>
  );

  if (!isBranch(value)) {
    return (
      <div className="json__line" style={{ paddingLeft: depth * 14 }}>
        <span className="json__toggle json__toggle--none" />
        {label}
        <Leaf value={value} />
        <span className="json__punct">{comma}</span>
      </div>
    );
  }

  const entries = Array.isArray(value)
    ? value.map((v, i) => [i, v])
    : Object.entries(value);
  const [openBrace, closeBrace] = Array.isArray(value) ? ['[', ']'] : ['{', '}'];

  if (!open) {
    return (
      <div className="json__line" style={{ paddingLeft: depth * 14 }}>
        <button
          type="button"
          className="json__toggle"
          onClick={() => setOpen(true)}
          aria-expanded="false"
          aria-label="Expand"
        >
          <Icon name="chevron_right" size={16} />
        </button>
        {label}
        <span className="json__punct">{openBrace}</span>
        {/* The ellipsis is a button too: it is the wider target, and on a
            collapsed row it is what the eye actually lands on. */}
        <button type="button" className="json__ellipsis" onClick={() => setOpen(true)}>
          …
        </button>
        <span className="json__punct">
          {closeBrace}
          {comma}
        </span>
      </div>
    );
  }

  return (
    <>
      <div className="json__line" style={{ paddingLeft: depth * 14 }}>
        <button
          type="button"
          className="json__toggle json__toggle--open"
          onClick={() => setOpen(false)}
          aria-expanded="true"
          aria-label="Collapse"
        >
          <Icon name="chevron_right" size={16} className="icon--rotated" />
        </button>
        {label}
        <span className="json__punct">{openBrace}</span>
      </div>

      {entries.map(([k, v], i) => (
        <Node
          key={k}
          name={Array.isArray(value) ? undefined : k}
          value={v}
          depth={depth + 1}
          isLast={i === entries.length - 1}
          openDepth={openDepth}
        />
      ))}

      <div className="json__line" style={{ paddingLeft: depth * 14 }}>
        <span className="json__toggle json__toggle--none" />
        <span className="json__punct">
          {closeBrace}
          {comma}
        </span>
      </div>
    </>
  );
}

export default function JsonView({ value, openDepth = OPEN_TO_DEPTH }) {
  return (
    <div className="json">
      <Node value={value} depth={0} isLast openDepth={openDepth} />
    </div>
  );
}
