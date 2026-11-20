/**
 * Font choices bundled with mLens. `value` is what persists in settings; `stack`
 * is the full CSS font-family used for the UI. Ubuntu and Ubuntu Mono ship as
 * local WOFF2 subsets in `design-system/fonts`, so no network or system install
 * is needed. Noto, DejaVu, Liberation and FreeSans resolve to the fonts that
 * ship with Ubuntu 24 (and fall back cleanly elsewhere).
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
    value: "Noto Sans",
    label: "Noto Sans",
    stack: '"Noto Sans", "DM Sans Variable", "DM Sans", system-ui, -apple-system, sans-serif',
  },
  {
    value: "Noto Serif",
    label: "Noto Serif",
    stack: '"Noto Serif", "Tinos", "Times New Roman", Times, "Liberation Serif", Georgia, serif',
  },
  {
    value: "DejaVu Sans",
    label: "DejaVu Sans",
    stack: '"DejaVu Sans", "Noto Sans", "DM Sans Variable", "DM Sans", sans-serif',
  },
  {
    value: "Liberation Sans",
    label: "Liberation Sans",
    stack: '"Liberation Sans", Arial, "DM Sans Variable", "DM Sans", sans-serif',
  },
  {
    value: "FreeSans",
    label: "FreeSans",
    stack: '"FreeSans", "Liberation Sans", Arial, sans-serif',
  },
  {
    value: "Tinos",
    label: "Tinos (Times-like)",
    stack: '"Tinos", "Times New Roman", Times, "Liberation Serif", Georgia, serif',
  },
  {
    value: "System UI",
    label: "System UI",
    stack: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
  },
  {
    value: "DM Mono",
    label: "DM Mono",
    stack: '"DM Mono", "SFMono-Regular", Menlo, monospace',
  },
  {
    value: "Ubuntu Mono",
    label: "Ubuntu Mono",
    stack: '"Ubuntu Mono", "DM Mono", monospace',
  },
  {
    value: "Noto Sans Mono",
    label: "Noto Sans Mono",
    stack: '"Noto Sans Mono", "DM Mono", monospace',
  },
  {
    value: "DejaVu Sans Mono",
    label: "DejaVu Sans Mono",
    stack: '"DejaVu Sans Mono", "DM Mono", monospace',
  },
  {
    value: "Liberation Mono",
    label: "Liberation Mono",
    stack: '"Liberation Mono", "DM Mono", monospace',
  },
  {
    value: "FreeMono",
    label: "FreeMono",
    stack: '"FreeMono", "DM Mono", monospace',
  },
  {
    value: "JetBrains Mono",
    label: "JetBrains Mono",
    stack: '"JetBrains Mono", "DM Mono", monospace',
  },
  {
    value: "Fira Code",
    label: "Fira Code",
    stack: '"Fira Code", "JetBrains Mono", monospace',
  },
  {
    value: "Source Code Pro",
    label: "Source Code Pro",
    stack: '"Source Code Pro", "DM Mono", monospace',
  },
] as const;

export function uiFontStack(value?: string): string {
  return UI_FONTS.find((font) => font.value === value)?.stack ?? UI_FONTS[0].stack;
}

/** Monospace choices for the terminal and editor; system fonts fall back cleanly. */
export const TERMINAL_FONTS = [
  { value: "DM Mono", label: "DM Mono" },
  { value: "Ubuntu Mono", label: "Ubuntu Mono" },
  { value: "Noto Sans Mono", label: "Noto Sans Mono" },
  { value: "DejaVu Sans Mono", label: "DejaVu Sans Mono" },
  { value: "Liberation Mono", label: "Liberation Mono" },
  { value: "FreeMono", label: "FreeMono" },
  { value: "JetBrains Mono", label: "JetBrains Mono" },
  { value: "Fira Code", label: "Fira Code" },
  { value: "Source Code Pro", label: "Source Code Pro" },
  { value: "Menlo", label: "Menlo" },
  { value: "Monaco", label: "Monaco" },
  { value: "SFMono-Regular", label: "SF Mono" },
] as const;
