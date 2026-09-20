import React, { useState } from 'react';
import { cellValue, deriveColumns, isPlainObject } from './ejson.js';
import Icon from '../brand/Icon.jsx';

// The table view of a page of documents.
//
// Columns are the union of every top-level key in the set being shown, because
// a MongoDB collection is polymorphic and the first document is not a schema.
// A document missing a field gets an empty cell -- deliberately empty rather
// than "null", so "the field is absent" and "the field is set to null" stay
// distinguishable, which in MongoDB is a real difference.
//
// A cell holding a subdocument or an array shows its size, and clicking it
// opens that value beneath the row -- as another table, with its own header
// and its own expandable cells. The same component renders every level, so a
// subdocument three deep is tabulated exactly like the document that contains
// it, and nothing switches representation partway down.

/** Cell kinds that hold something worth opening. */
const EXPANDABLE = new Set(['object', 'array']);

/**
 * Turns a nested value into rows and columns.
 *
 * An object is one row. An array of documents is one row each. An array of
 * anything else -- scalars, or a mix -- becomes a single `value` column, since
 * those elements have no field names to make columns from.
 */
function tabulate(value) {
  if (Array.isArray(value)) {
    // cellValue decides what counts as a document rather than typeof, so a
    // BSON wrapper like {$oid} is treated as the scalar it represents and
    // does not become a one-column table of "$oid".
    const allDocs = value.length > 0 && value.every((v) => cellValue(v).kind === 'object');
    if (allDocs) return { rows: value, columns: deriveColumns(value), indexed: true };
    return {
      rows: value.map((v) => ({ value: v })),
      columns: ['value'],
      indexed: true,
    };
  }
  if (isPlainObject(value)) return { rows: [value], columns: Object.keys(value), indexed: false };
  // Reached only if something non-nested was marked expandable.
  return { rows: [{ value }], columns: ['value'], indexed: false };
}

/**
 * One table. Renders its own expansions by recursing, so every level of a
 * document is the same component with the same behaviour.
 *
 * `indexed` adds the leading number column; the top level numbers by position
 * in the collection, an array numbers by position in the array, and a single
 * subdocument has nothing to number.
 */
function DataTable({ rows, columns, startIndex = 0, indexed = true, sticky = false, label }) {
  // rowIndex -> column name. One expansion per row: a row with two nested
  // fields would otherwise sprout two panels with nothing saying which cell
  // each belongs to. Clicking a second cell moves the panel to it.
  const [openCell, setOpenCell] = useState({});

  const toggle = (row, col) =>
    setOpenCell((prev) => ({ ...prev, [row]: prev[row] === col ? undefined : col }));

  if (columns.length === 0) {
    return <p className="browse__note">Nothing to tabulate here.</p>;
  }

  return (
    <table className={`browse__table browse__table--docs ${sticky ? '' : 'browse__table--nested'}`}>
      <thead>
        <tr>
          {indexed && (
            /* Numbering continues across pages at the top level -- page two
               starts at 26 -- so the column agrees with the range the pager
               reports. It is a position, not a document id. */
            <th
              className={`browse__th--num ${sticky ? 'browse__th--sticky' : ''}`}
              scope="col"
              title={label ?? 'Position'}
            >
              #
            </th>
          )}
          {columns.map((c) => (
            <th key={c} scope="col" className="browse__th--left">{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => {
          const open = openCell[i];
          return (
            <React.Fragment key={i}>
              <tr className={open !== undefined ? 'browse__row--open' : ''}>
                {indexed && (
                  <td className={`browse__td--num ${sticky ? 'browse__td--sticky' : ''}`}>
                    {startIndex + i + 1}
                  </td>
                )}
                {columns.map((c) => {
                  // Object.hasOwn, not a truthiness check: a field holding 0,
                  // "" or false is present, and must not render as missing.
                  const present = isPlainObject(row) && Object.hasOwn(row, c);
                  const raw = present ? row[c] : undefined;
                  const { text, kind } = cellValue(raw);
                  const isOpen = open === c;

                  if (!EXPANDABLE.has(kind)) {
                    return (
                      <td
                        key={c}
                        className={`browse__cell browse__cell--${kind}`}
                        title={kind === 'missing' ? `${c}: not present` : text}
                      >
                        {text}
                      </td>
                    );
                  }

                  return (
                    <td
                      key={c}
                      className={`browse__cell browse__cell--${kind} browse__cell--expandable ${
                        isOpen ? 'browse__cell--open' : ''
                      }`}
                    >
                      <button
                        type="button"
                        className="browse__cell-btn"
                        onClick={() => toggle(i, c)}
                        aria-expanded={isOpen}
                        title={isOpen ? `Hide ${c}` : `Show ${c}`}
                      >
                        <Icon name="chevron_right" size={16} className={isOpen ? 'icon--rotated' : ''} />
                        {text}
                      </button>
                    </td>
                  );
                })}
              </tr>

              {open !== undefined && (
                <tr className="browse__subrow">
                  {/* Spans the whole table rather than sitting under its own
                      column: a nested value is wider than the cell that
                      summarised it, and the table scrolls sideways. */}
                  <td colSpan={columns.length + (indexed ? 1 : 0)}>
                    <NestedPanel
                      value={row[open]}
                      field={open}
                      rowLabel={indexed ? String(startIndex + i + 1) : null}
                      onClose={() => toggle(i, open)}
                    />
                  </td>
                </tr>
              )}
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

/** The panel under an expanded cell: a heading, and the value as a table. */
function NestedPanel({ value, field, rowLabel, onClose }) {
  const { rows, columns, indexed } = tabulate(value);

  return (
    <div className="browse__subdoc">
      <div className="browse__subdoc-head">
        <Icon name="subdirectory_arrow_right" size={16} />
        {/* Which row and which field this came from -- the table scrolls
            sideways, so the cell that opened it may be off screen. */}
        <span className="browse__subdoc-path">
          {rowLabel ? `${rowLabel} · ` : ''}{field}
          {Array.isArray(value) && ` · ${value.length} item${value.length === 1 ? '' : 's'}`}
        </span>
        <button
          type="button"
          className="browse__subdoc-close"
          onClick={onClose}
          aria-label={`Hide ${field}`}
          title="Hide"
        >
          <Icon name="close" size={16} />
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="browse__subdoc-empty">Empty.</p>
      ) : (
        <div className="browse__subdoc-scroll">
          <DataTable rows={rows} columns={columns} indexed={indexed} />
        </div>
      )}
    </div>
  );
}

export default function DocumentsTable({ docs, startIndex = 0 }) {
  const columns = deriveColumns(docs);

  if (columns.length === 0) {
    return <p className="browse__note">These documents have no fields to tabulate.</p>;
  }

  return (
    <div className="browse__table-wrap">
      <DataTable
        rows={docs}
        columns={columns}
        startIndex={startIndex}
        indexed
        sticky
        label="Position in the collection"
      />
    </div>
  );
}
