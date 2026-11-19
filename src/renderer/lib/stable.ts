/**
 * A13: identity helpers for polled data. The fetch hooks rebuild their Maps
 * on every tick; comparing content first and keeping the previous reference
 * stops timer-driven polls from invalidating every downstream memo
 * (`cellContext` → search/filter/sort) when nothing actually changed.
 */
export function sameMapValues<V>(
  left: Map<string, V>,
  right: Map<string, V>,
  equal: (a: V, b: V) => boolean,
): boolean {
  if (left === right) return true;
  if (left.size !== right.size) return false;
  for (const [key, value] of left) {
    const other = right.get(key);
    if (other === undefined || !equal(value, other)) return false;
  }
  return true;
}

/** Element-wise comparison for string lists (claim → pod names). */
export function sameStringList(left: string[], right: string[]): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}
