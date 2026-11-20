import { useId } from "react";

/**
 * The mLens application mark, matching `build/icon.svg` (the Electron package
 * icon): a red lens on the dark rounded tile. Kept as an inline SVG so the
 * shell, welcome page and hotbar all use the same artwork without a runtime
 * asset URL.
 */
export function MlensLogo({ className }: { className?: string }) {
  const rawId = useId();
  const id = rawId.replace(/[^a-zA-Z0-9_-]/g, "");
  const backgroundId = `mlens-bg-${id}`;
  const lensId = `mlens-lens-${id}`;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1024 1024"
      className={className}
      role="img"
      aria-label="mLens"
    >
      <defs>
        <linearGradient id={backgroundId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2A1620" />
          <stop offset="1" stopColor="#140B10" />
        </linearGradient>
        <linearGradient id={lensId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FCA5A5" />
          <stop offset="0.55" stopColor="#EF4444" />
          <stop offset="1" stopColor="#991B1B" />
        </linearGradient>
      </defs>
      <rect width="1024" height="1024" rx="228" fill={`url(#${backgroundId})`} />
      <circle cx="512" cy="512" r="286" fill="none" stroke={`url(#${lensId})`} strokeWidth="58" />
      <circle cx="512" cy="512" r="132" fill="none" stroke="#EF4444" strokeWidth="34" opacity="0.9" />
      <circle cx="512" cy="512" r="58" fill="#FCA5A5" />
      <g stroke="#EF4444" strokeWidth="30" strokeLinecap="round">
        <line x1="512" y1="168" x2="512" y2="248" />
        <line x1="512" y1="776" x2="512" y2="856" />
        <line x1="168" y1="512" x2="248" y2="512" />
        <line x1="776" y1="512" x2="856" y2="512" />
      </g>
    </svg>
  );
}
