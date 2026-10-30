/** Ids shorter than this never count as a substring match; one letter would match half the file. */
const MIN_SUBSTRING = 2;

/** Number of single-character edits that turn `a` into `b`. */
function distance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row.push(Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1)));
    }
    prev = row;
  }
  return prev[b.length]!;
}

/**
 * Up to `max` ids that look like a misspelling of `target`, nearest first (ties keep the input
 * order). An id counts when it is within max(2, floor(target.length / 3)) edits, ignoring case;
 * one that contains the target, or is contained in it, counts as distance 1.
 */
export function closestIds(target: string, ids: string[], max = 3): string[] {
  const t = target.toLowerCase();
  const limit = Math.max(2, Math.floor(t.length / 3));
  const scored: { id: string; d: number }[] = [];
  for (const id of ids) {
    const s = id.toLowerCase();
    const contained = Math.min(s.length, t.length) >= MIN_SUBSTRING && (s.includes(t) || t.includes(s));
    const d = contained ? 1 : distance(t, s);
    if (d <= limit) scored.push({ id, d });
  }
  return scored
    .sort((x, y) => x.d - y.d)
    .slice(0, max)
    .map((x) => x.id);
}
