// PostgreSQL DATE values are calendar dates, parsed by pg at local midnight.
export function databaseDate(value: unknown): string {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`;
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:$|T)/.test(value)) return value.slice(0,10);
  throw new Error('Invalid database calendar date');
}
