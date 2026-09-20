import React from 'react';
import { cellValue, deriveColumns } from './ejson.js';

// The table view of a page of documents.
//
// Columns are the union of every top-level key on the page, because a
// collection is polymorphic and the first document is not a schema. A
// document missing a field gets an empty cell -- deliberately empty rather
// than "null", so "the field is absent" and "the field is set to null" stay
// distinguishable, which in MongoDB is a real difference.

export default function DocumentsTable({ docs, startIndex = 0 }) {
  const columns = deriveColumns(docs);

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
          {docs.map((doc, i) => (
            <tr key={i}>
              <td className="browse__td--num">{startIndex + i + 1}</td>
              {columns.map((c) => {
                // Object.hasOwn, not a truthiness check: a field holding 0,
                // "" or false is present, and must not render as missing.
                const present = doc && Object.hasOwn(doc, c);
                const { text, kind } = cellValue(present ? doc[c] : undefined);
                return (
                  <td
                    key={c}
                    className={`browse__cell browse__cell--${kind}`}
                    title={kind === 'missing' ? `${c}: not present` : text}
                  >
                    {text}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
