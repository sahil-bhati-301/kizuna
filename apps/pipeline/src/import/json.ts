/** Byte-stable JSON for golden files (shared by the importers). */

/** JSON.stringify with 2-space indent, but arrays of primitives on one line (as Prettier does). */
export function stringify(value: unknown, indent = ''): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    if (value.every((v) => v === null || typeof v !== 'object'))
      return `[${value.map((v) => JSON.stringify(v)).join(', ')}]`;
    const inner = `${indent}  `;
    return `[\n${value.map((v) => inner + stringify(v, inner)).join(',\n')}\n${indent}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) return '{}';
    const inner = `${indent}  `;
    const body = entries
      .map(([k, v]) => `${inner}${JSON.stringify(k)}: ${stringify(v, inner)}`)
      .join(',\n');
    return `{\n${body}\n${indent}}`;
  }
  return JSON.stringify(value);
}
