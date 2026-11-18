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
