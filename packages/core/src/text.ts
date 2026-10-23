// Small helpers for friendly, concrete English.

export function listAnd(items: readonly string[], max = 4): string {
  const shown = items.slice(0, max);
  const extra = items.length - shown.length;
  if (extra > 0) shown.push(`${extra} more`);
  if (shown.length <= 1) return shown.join('');
  return `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`;
}

export function times(n: number): string {
  if (n === 1) return 'once';
  if (n === 2) return 'twice';
  return `${n} times`;
}

/** "2 of 3 times", "once out of 2 chances" style helper. */
export function ofTimes(c: number, n: number): string {
  return `${c} of ${n} times`;
}

export function percent(x: number): string {
  return `${Math.round(x * 100)}%`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
