// Reading canonical Extended JSON for the table view.
//
// The JSON view renders EJSON's structure -- an ObjectId is visibly a
// {"$oid": ...} node, which is the point of it. A table cell has one line and
// cannot show structure, so these collapse each wrapper to the scalar a reader
// would recognise: an ObjectId to its hex, a date to a timestamp, a long to
// its digits.
//
// The wrappers are unwrapped explicitly rather than by looking for any
// single-$-key object, because a document is allowed to contain a field
// literally named "$oid" and guessing would misread it as a BSON type.

/** The BSON wrappers worth flattening, and how each reads as one value. */
const WRAPPERS = {
  $oid: (v) => v,
  $numberInt: (v) => Number(v),
  $numberLong: (v) => v, // kept as a string: a long can exceed Number's range
  $numberDouble: (v) => Number(v),
  $numberDecimal: (v) => v,
  $symbol: (v) => v,
  $code: (v) => (typeof v === 'string' ? v : String(v)),
  $timestamp: (v) => `${v?.t ?? '?'}:${v?.i ?? '?'}`,
  $binary: () => '«binary»',
  $regularExpression: (v) => `/${v?.pattern ?? ''}/${v?.options ?? ''}`,
  $minKey: () => 'MinKey',
  $maxKey: () => 'MaxKey',
  $undefined: () => undefined,
};

const isPlainObject = (v) =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

/** A $date is special: its inner value may itself be a {$numberLong}. */
function readDate(value) {
  const ms = isPlainObject(value) ? Number(value.$numberLong) : value;
  const d = new Date(ms);
  // An unparseable date is shown raw rather than as "Invalid Date", so a
  // malformed document reads as malformed instead of as a rendering bug.
  return Number.isNaN(d.getTime()) ? String(ms) : d.toISOString().replace('T', ' ').replace('.000Z', 'Z');
}

/**
 * One EJSON value as the table should show it.
 *
 * Returns { text, kind } rather than a string, so the cell can colour a
 * number differently from a string without re-deciding what the value was.
 */
export function cellValue(value) {
  if (value === undefined) return { text: '', kind: 'missing' };
  if (value === null) return { text: 'null', kind: 'null' };

  if (Array.isArray(value)) {
    return { text: `[${value.length}]`, kind: 'array' };
  }

  if (isPlainObject(value)) {
    const keys = Object.keys(value);
    if (keys.length === 1) {
      const [k] = keys;
      if (k === '$date') return { text: readDate(value.$date), kind: 'date' };
      if (k in WRAPPERS) {
        const out = WRAPPERS[k](value[k]);
        return {
          text: out === undefined ? '' : String(out),
          kind: k === '$oid' ? 'id' : 'number',
        };
      }
    }
    // A real nested document. The key count is more use than "{…}" alone --
    // it distinguishes an empty subdocument from a populated one.
    return { text: `{${keys.length}}`, kind: 'object' };
  }

  switch (typeof value) {
    case 'string':  return { text: value, kind: 'string' };
    case 'number':  return { text: String(value), kind: 'number' };
    case 'boolean': return { text: String(value), kind: 'boolean' };
    default:        return { text: String(value), kind: 'string' };
  }
}

/**
 * The columns for a page of documents.
 *
 * MongoDB collections are polymorphic, so the column set is the union of every
 * top-level key on the page, not the shape of the first document. Order is
 * first-seen, which keeps a document's own field order recognisable, except
 * that _id leads when present -- it is the one field a reader looks for by
 * position.
 *
 * This describes the PAGE, not the collection: page two may have columns page
 * one did not. That is a true reflection of a polymorphic collection, and the
 * alternative -- scanning everything to build a stable header -- is a full
 * collection scan per page turn.
 */
export function deriveColumns(docs) {
  const seen = [];
  const set = new Set();
  for (const doc of docs) {
    if (!isPlainObject(doc)) continue;
    for (const k of Object.keys(doc)) {
      if (!set.has(k)) { set.add(k); seen.push(k); }
    }
  }
  return set.has('_id') ? ['_id', ...seen.filter((k) => k !== '_id')] : seen;
}
