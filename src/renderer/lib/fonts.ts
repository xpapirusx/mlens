/**
 * Font choices bundled with mLens. `value` is what persists in settings; `stack`
 * is the full CSS font-family used for the UI. Ubuntu and Ubuntu Mono ship as
 * local WOFF2 subsets in `design-system/fonts`, so no network or system install
 * is needed.
 */
export const UI_FONTS = [
  {
    value: "DM Sans",
    label: "DM Sans (default)",
    stack: '"DM Sans Variable", "DM Sans", "Ubuntu", system-ui, -apple-system, sans-serif',
  },
  {
    value: "Ubuntu",
    label: "Ubuntu",
    stack: '"Ubuntu", "DM Sans Variable", "DM Sans", system-ui, -apple-system, sans-serif',
  },
  {
    value: "System UI",
    label: "System UI",
    stack: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
  },
] as const;

export function uiFontStack(value?: string): string {
  return UI_FONTS.find((font) => font.value === value)?.stack ?? UI_FONTS[0].stack;
}

/** Monospace choices for the terminal; Menlo/Monaco/SF Mono use installed fonts. */
export const TERMINAL_FONTS = [
  { value: "DM Mono", label: "DM Mono" },
  { value: "Ubuntu Mono", label: "Ubuntu Mono" },
  { value: "Menlo", label: "Menlo" },
  { value: "Monaco", label: "Monaco" },
  { value: "SFMono-Regular", label: "SF Mono" },
] as const;
