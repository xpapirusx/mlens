import type { ClusterColorRule } from "@shared/types";

/**
 * Freelens' seeded avatar colour: an FNV-1a hue with fixed saturation and
 * lightness, so white initials always clear WCAG AA and a cluster keeps the
 * same colour in the hotbar, the catalog and the sidebar.
 */
export function clusterColor(name: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < name.length; index += 1) {
    hash ^= name.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `hsl(${(hash >>> 0) % 360}, 60%, 27%)`;
}

/** Dark, white-text-safe swatches offered in the hotbar and color rules. */
export const CLUSTER_COLOR_PALETTE = [
  "#b91c1c",
  "#c2410c",
  "#a16207",
  "#4d7c0f",
  "#15803d",
  "#0f766e",
  "#0369a1",
  "#1d4ed8",
  "#6d28d9",
  "#a21caf",
  "#be123c",
  "#334155",
] as const;

function ruleMatches(pattern: string, value: string): boolean {
  try {
    return new RegExp(pattern, "i").test(value);
  } catch {
    // A bare glob like `*prod*` is not valid regex — treat `*` as `.*`.
    const escaped = pattern
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*");
    try {
      return new RegExp(`^${escaped}$`, "i").test(value);
    } catch {
      return false;
    }
  }
}

/**
 * Colour for a cluster tile/avatar:
 * 1. a manual colour chosen in the hotbar,
 * 2. the first matching regex rule (cluster name + context),
 * 3. the seeded FNV colour (old behaviour).
 */
export function resolveClusterColor(
  id: string,
  name: string,
  colors?: Record<string, string>,
  rules?: ClusterColorRule[],
  extra?: string,
): string {
  const manual = colors?.[id];
  if (manual) return manual;
  const haystack = extra ? `${name} ${extra}` : name;
  for (const rule of rules ?? []) {
    if (ruleMatches(rule.pattern, haystack)) return rule.color;
  }
  return clusterColor(name);
}
