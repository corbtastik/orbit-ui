import React, { useState } from 'react';
import { cellValue, deriveColumns } from './ejson.js';
import JsonView from './JsonView.jsx';
import Icon from '../brand/Icon.jsx';

// The table view of a page of documents.
//
// Columns are the union of every top-level key on the page, because a
// collection is polymorphic and the first document is not a schema. A
// document missing a field gets an empty cell -- deliberately empty rather
// than "null", so "the field is absent" and "the field is set to null" stay
// distinguishable, which in MongoDB is a real difference.
//
// A cell holding a subdocument or an array shows its size, and clicking it
// opens the value in a row directly beneath. One line cannot hold a nested
// value, and making the reader switch to the JSON view to see one field
// loses their place in the table.

/** Cell kinds that hold something worth opening. */
const EXPANDABLE = new Set(['object', 'array']);

// Subdocument and its immediate fields open; anything deeper stays shut and
// opens on its own twisty. Opening every level would bury the field the
// reader clicked on under whatever it contains.
const SUBDOC_DEPTH = 2;

export default function DocumentsTable({ docs, startIndex = 0 }) {
  const columns = deriveColumns(docs);

  // rowIndex -> column name. One expansion per row: a row with two nested
  // fields would otherwise sprout two panels with nothing saying which cell
  // each belongs to. Clicking a second cell moves the panel to it.
  const [openCell, setOpenCell] = useState({});

  const toggle = (row, col) =>
    setOpenCell((prev) => ({ ...prev, [row]: prev[row] === col ? undefined : col }));

  if (columns.length === 0) {
    return <p className="browse__note">These documents have no fields to tabulate.</p>;
  }

  return (
    <div className="browse__table-wrap">
      <table className="browse__table browse__table--docs">
        <thead>
          <tr>
            {/* Numbering continues across pages -- page two starts at 26 --
                so the column agrees with the range the pager reports rather
                than restarting and implying a different set of documents.
                It is a position in the result set, not a document id. */}
            <th className="browse__th--num" scope="col" title="Position in the collection">#</th>
            {columns.map((c) => (
              <th key={c} scope="col" className="browse__th--left">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {docs.map((doc, i) => {
            const open = openCell[i];
            return (
              <React.Fragment key={i}>
                <tr className={open ? 'browse__row--open' : ''}>
                  <td className="browse__td--num">{startIndex + i + 1}</td>
                  {columns.map((c) => {
                    // Object.hasOwn, not a truthiness check: a field holding 0,
                    // "" or false is present, and must not render as missing.
                    const present = doc && Object.hasOwn(doc, c);
                    const raw = present ? doc[c] : undefined;
                    const { text, kind } = cellValue(raw);
                    const expandable = EXPANDABLE.has(kind);
                    const isOpen = open === c;

                    if (!expandable) {
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
                          <Icon
                            name="chevron_right"
                            size={16}
                            className={isOpen ? 'icon--rotated' : ''}
                          />
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
                    <td colSpan={columns.length + 1}>
                      <div className="browse__subdoc">
                        <div className="browse__subdoc-head">
                          <Icon name="subdirectory_arrow_right" size={16} />
                          <span className="browse__subdoc-path">
                            {startIndex + i + 1} · {open}
                          </span>
                          <button
                            type="button"
                            className="browse__subdoc-close"
                            onClick={() => toggle(i, open)}
                            aria-label={`Hide ${open}`}
                            title="Hide"
                          >
                            <Icon name="close" size={16} />
                          </button>
                        </div>
                        <JsonView value={doc[open]} openDepth={SUBDOC_DEPTH} />
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
