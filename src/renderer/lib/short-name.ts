/**
 * Freelens' short cluster name, shared by the hotbar, catalog and sidebar so a
 * cluster always shows the same badge everywhere.
 *
 * Dashes are the preferred separator (`msk-avg-dev-iaas` → `MAD`). Names
 * without a dash fall back to the older heuristic: whitespace, then `-`/`_`,
 * then `@`, and finally the first two characters of a single word
 * (`production` → `PR`).
 */
export function clusterShortName(name: string | undefined | null): string {
  const value = name?.trim() ?? "";
  if (!value) return "??";

  const groups = (pattern: RegExp) => value.split(pattern).filter(Boolean);
  let parts = groups(/-/);
  if (parts.length <= 1) {
    const byWhitespace = groups(/\s+/);
    if (byWhitespace.length > 1) {
      parts = byWhitespace;
    } else {
      const bySeparator = groups(/[-_]+/);
      parts = bySeparator.length > 1 ? bySeparator : groups(/@+/);
    }
  }

  const [first = "", secondGroup, thirdGroup] = parts;
  const firstChars = [...first];
  const second = secondGroup ? [...secondGroup] : firstChars.slice(1);
  const third = thirdGroup ? [...thirdGroup] : [];
  return [firstChars[0], second[0], third[0]].filter(Boolean).join("").toUpperCase();
}
