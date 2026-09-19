// Formatting shared by the browse views.

// Decimal units, not binary: 45056 bytes reads as "45.06 kB", which is what
// Atlas and Compass show. Dividing by 1024 here would put every number in
// these tables slightly out of step with the console they are checked against.
const UNITS = ['B', 'kB', 'MB', 'GB', 'TB', 'PB'];

export function formatBytes(n) {
  if (n == null) return '–';
  if (n === 0) return '0 B';

  let value = n;
  let unit = 0;
  while (value >= 1000 && unit < UNITS.length - 1) {
    value /= 1000;
    unit += 1;
  }
  // Bytes are whole; everything above is two decimals, so columns line up.
  return unit === 0 ? `${value} B` : `${value.toFixed(2)} ${UNITS[unit]}`;
}

export function formatCount(n) {
  return n == null ? '–' : n.toLocaleString();
}
