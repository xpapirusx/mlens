import type { LogLevel } from "./log-types";

/**
 * The log viewer is a console surface: it keeps its own dark palette instead of
 * following the app theme, exactly like the terminal. Static class strings so
 * Tailwind's scanner sees every one of them.
 */
export interface LogPalette {
  containerBg: string;
  toolbarBg: string;
  toolbarBgMuted: string;
  menuBg: string;
  elevatedBg: string;
  border: string;
  borderLight: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textDisabled: string;
  textError: string;
  hoverBg: string;
  hoverSurface: string;
  hoverText: string;
  toolbarActive: string;
  currentMatchBg: string;
  levelActiveError: string;
  levelActiveWarn: string;
  levelActiveInfo: string;
  levelActiveDebug: string;
  levelActiveOther: string;
  levelBadgeError: string;
  levelBadgeWarn: string;
  levelBadgeInfo: string;
  levelBadgeDebug: string;
  levelBadgeNeutral: string;
  syntaxKey: string;
  syntaxString: string;
  syntaxNumber: string;
  syntaxBoolean: string;
  syntaxNull: string;
}

export const LOG_PALETTE: LogPalette = {
  containerBg: "bg-slate-950",
  toolbarBg: "bg-slate-900",
  toolbarBgMuted: "bg-slate-900/60",
  menuBg: "bg-slate-900",
  elevatedBg: "bg-slate-800",

  border: "border-slate-800",
  borderLight: "border-slate-700",

  textPrimary: "text-slate-100",
  textSecondary: "text-slate-400",
  textTertiary: "text-slate-500",
  textDisabled: "text-slate-600",
  textError: "text-red-400",

  hoverBg: "hover:bg-slate-800",
  hoverSurface: "hover:bg-slate-800/50",
  hoverText: "hover:text-slate-100",
  toolbarActive: "bg-slate-700 text-slate-100 hover:bg-slate-600",

  currentMatchBg: "bg-yellow-500/10",

  levelActiveError: "bg-red-500/20 text-red-400 border-red-500/40",
  levelActiveWarn: "bg-amber-500/20 text-amber-400 border-amber-500/40",
  levelActiveInfo: "bg-blue-500/20 text-blue-400 border-blue-500/40",
  levelActiveDebug: "bg-slate-700 text-slate-300 border-slate-600",
  levelActiveOther: "bg-transparent text-slate-300 border-slate-500",

  levelBadgeError: "bg-red-500/20 text-red-400 border border-red-500/40",
  levelBadgeWarn: "bg-amber-500/20 text-amber-400 border border-amber-500/40",
  levelBadgeInfo: "bg-blue-500/20 text-blue-400 border border-blue-500/40",
  levelBadgeDebug: "bg-slate-700 text-slate-300 border border-slate-600",
  levelBadgeNeutral: "bg-slate-800 text-slate-400 border border-slate-700",

  // Hex values tuned for the `bg-slate-950` container.
  syntaxKey: "#7cacf8",
  syntaxString: "#73c991",
  syntaxNumber: "#e5c07b",
  syntaxBoolean: "#c678dd",
  syntaxNull: "#808080",
};

/** Per-level content colour (the log text body, Radar-style). */
export function getLogLevelColor(level: LogLevel): string {
  switch (level) {
    case "error":
      return "text-red-400";
    case "warn":
      return "text-amber-400";
    case "info":
      return "text-blue-400";
    case "debug":
      return "text-slate-400";
    default:
      return "text-slate-100";
  }
}
