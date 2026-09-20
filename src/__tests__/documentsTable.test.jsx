import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import DocumentsTable from '../components/browse/DocumentsTable.jsx';
import { cellValue, deriveColumns } from '../components/browse/ejson.js';

// The table view's two load-bearing behaviours: where an expanded
// subdocument lands, and what counts as a present field.
//
// cleanup is explicit because this project runs vitest without `globals`.
// Testing Library registers its own afterEach only when the global hooks are
// present, so without this the DOM accumulates across tests and queries start
// matching elements from a previous one.
afterEach(cleanup);

const docs = [
  {
    _id: { $oid: 'a'.repeat(24) },
    city: 'Munhall',
    serviceIssue: { type: 'enterprise', customer: 'Boeing' },
    tags: ['x', 'y'],
  },
  { _id: { $oid: 'b'.repeat(24) }, city: 'Sipsey', serviceIssue: { type: 'retail' } },
];

// Only the outer table's own rows. An expanded cell now renders a nested
// table inside a row, so an unscoped 'tbody tr' would count those too.
const rowClasses = (container) =>
  [...container.querySelectorAll('.browse__table-wrap > table > tbody > tr')]
    .map((r) => r.className.replace('browse__row--open', 'open').replace('browse__subrow', 'sub').trim() || '-');

describe('expanding a nested cell', () => {
  it('opens the panel in a row directly beneath its own row', () => {
    const { container } = render(<DocumentsTable docs={docs} startIndex={25} />);
    expect(rowClasses(container)).toEqual(['-', '-']);

    fireEvent.click(screen.getAllByTitle('Show serviceIssue')[0]);
    expect(rowClasses(container)).toEqual(['open', 'sub', '-']);
  });

  // The panel names the row it came from using the collection position, not
  // the index within the page -- startIndex 25 makes the first row #26.
  it('labels the panel with the field and the page-adjusted row number', () => {
    const { container } = render(<DocumentsTable docs={docs} startIndex={25} />);
    fireEvent.click(screen.getAllByTitle('Show serviceIssue')[0]);
    expect(container.querySelector('.browse__subdoc-path').textContent).toBe('26 · serviceIssue');
  });

  // One panel per row: clicking a second nested cell moves it rather than
  // opening a second panel with nothing saying which cell it belongs to.
  it('moves the panel when another cell in the same row is clicked', () => {
    const { container } = render(<DocumentsTable docs={docs} startIndex={0} />);
    fireEvent.click(screen.getAllByTitle('Show serviceIssue')[0]);
    fireEvent.click(screen.getByTitle('Show tags'));
    expect(rowClasses(container)).toEqual(['open', 'sub', '-']);
    // An array panel says how many items it holds.
    expect(container.querySelector('.browse__subdoc-path').textContent).toBe('1 · tags · 2 items');
  });

  it('expands rows independently and closes on a second click', () => {
    const { container } = render(<DocumentsTable docs={docs} startIndex={0} />);
    fireEvent.click(screen.getAllByTitle('Show serviceIssue')[0]);
    // Row 1's button now reads "Hide", so the remaining "Show" is row 2's.
    fireEvent.click(screen.getAllByTitle('Show serviceIssue')[0]);
    expect(rowClasses(container)).toEqual(['open', 'sub', 'open', 'sub']);

    fireEvent.click(screen.getAllByTitle('Hide serviceIssue')[0]);
    expect(rowClasses(container)).toEqual(['-', 'open', 'sub']);
  });

  // Only nested values are clickable; a scalar is just text.
  it('does not offer to expand a scalar cell', () => {
    render(<DocumentsTable docs={docs} startIndex={0} />);
    expect(screen.queryByTitle('Show city')).toBeNull();
  });
});

describe('polymorphic columns and presence', () => {
  it('unions every key on the page, with _id first', () => {
    expect(deriveColumns([{ b: 1 }, { _id: 1, c: 2 }])).toEqual(['_id', 'b', 'c']);
  });

  // The difference between "absent" and "set to null" is real in MongoDB, and
  // a falsy value is present. A truthiness check gets all of these wrong.
  it('treats 0, empty string and false as present, and absent as blank', () => {
    expect(cellValue(0)).toEqual({ text: '0', kind: 'number' });
    expect(cellValue('')).toEqual({ text: '', kind: 'string' });
    expect(cellValue(false)).toEqual({ text: 'false', kind: 'boolean' });
    expect(cellValue(null)).toEqual({ text: 'null', kind: 'null' });
    expect(cellValue(undefined)).toEqual({ text: '', kind: 'missing' });
  });

  // A 64-bit long must not go through Number on the way to the cell.
  it('keeps a $numberLong at full precision', () => {
    expect(cellValue({ $numberLong: '9223372036854775807' }).text).toBe('9223372036854775807');
  });
});

describe('nested values render as tables, not JSON', () => {
  const nested = (container) =>
    container.querySelector('.browse__subdoc .browse__table--nested');

  // :scope > is required, not cosmetic. A nested table lives inside the outer
  // table's tbody, so `querySelectorAll('tbody tr')` scoped to the nested
  // table still matches its own thead row -- that row has a tbody ancestor,
  // just the outer one. Scoping filters the results, not the matching.
  const headers = (t) => [...t.querySelectorAll(':scope > thead > tr > th')].map((h) => h.textContent);
  const bodyRows = (t) => [...t.querySelectorAll(':scope > tbody > tr')].map((r) => r.textContent);
  const bodyCells = (t) => [...t.querySelectorAll(':scope > tbody > tr > td')].map((d) => d.textContent);

  it('tabulates a subdocument: its keys become the header, one row of values', () => {
    const { container } = render(<DocumentsTable docs={docs} startIndex={0} />);
    fireEvent.click(screen.getAllByTitle('Show serviceIssue')[0]);

    const table = nested(container);
    expect(table).toBeTruthy();
    expect(headers(table)).toEqual(['type', 'customer']);
    expect(bodyCells(table)).toEqual(['enterprise', 'Boeing']);
  });

  // A single subdocument has nothing to number, so the index column is gone.
  it('omits the number column for a single subdocument', () => {
    const { container } = render(<DocumentsTable docs={docs} startIndex={0} />);
    fireEvent.click(screen.getAllByTitle('Show serviceIssue')[0]);
    expect(nested(container).querySelector('.browse__th--num')).toBeNull();
  });

  it('gives an array of scalars one row each under a value column', () => {
    const { container } = render(<DocumentsTable docs={docs} startIndex={0} />);
    fireEvent.click(screen.getByTitle('Show tags'));

    const table = nested(container);
    expect(headers(table)).toEqual(['#', 'value']);
    expect(bodyRows(table)).toEqual(['1x', '2y']);
  });

  it('gives an array of documents a column per field, unioned', () => {
    const rows = [{ _id: 1, items: [{ sku: 'a', qty: 2 }, { sku: 'b', note: 'x' }] }];
    const { container } = render(<DocumentsTable docs={rows} startIndex={0} />);
    fireEvent.click(screen.getByTitle('Show items'));

    const table = nested(container);
    expect(headers(table)).toEqual(['#', 'sku', 'qty', 'note']);
  });

  // The same component renders every level, so a subdocument inside a
  // subdocument expands the same way rather than falling back to raw JSON.
  it('expands a subdocument inside a subdocument', () => {
    const rows = [{ _id: 1, outer: { name: 'o', inner: { deep: 'yes' } } }];
    const { container } = render(<DocumentsTable docs={rows} startIndex={0} />);

    fireEvent.click(screen.getByTitle('Show outer'));
    fireEvent.click(screen.getByTitle('Show inner'));

    const panels = container.querySelectorAll('.browse__subdoc');
    expect(panels).toHaveLength(2);
    const deepest = panels[panels.length - 1];
    const deepTable = deepest.querySelector('.browse__table--nested');
    expect(headers(deepTable)).toEqual(['deep']);
    expect(bodyCells(deepTable)).toEqual(['yes']);
  });

  it('renders no JSON tree anywhere', () => {
    const { container } = render(<DocumentsTable docs={docs} startIndex={0} />);
    fireEvent.click(screen.getAllByTitle('Show serviceIssue')[0]);
    expect(container.querySelector('.json')).toBeNull();
  });
});
