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

/** Monospace choices for the terminal; Menlo/Monaco/SF Mono use installed fonts. */
export const TERMINAL_FONTS = [
  { value: "DM Mono", label: "DM Mono" },
  { value: "Ubuntu Mono", label: "Ubuntu Mono" },
  { value: "JetBrains Mono", label: "JetBrains Mono" },
  { value: "Fira Code", label: "Fira Code" },
  { value: "Source Code Pro", label: "Source Code Pro" },
  { value: "Menlo", label: "Menlo" },
  { value: "Monaco", label: "Monaco" },
  { value: "SFMono-Regular", label: "SF Mono" },
] as const;
