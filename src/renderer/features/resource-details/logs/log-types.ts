export type LogLevel = "error" | "warn" | "info" | "debug" | "unknown";

/**
 * Where a line's level came from. `structured` and `header` are the line
 * stating its own severity; `keyword` is a guess from words in the message, so
 * it must not override a line's membership in a stack trace or a structured
 * field that says otherwise.
 */
export type LevelSource = "structured" | "header" | "keyword" | "none";

export interface LogEntry {
  id: number;
  timestamp: string;
  content: string;
  container: string;
  /** Pod name — kept for mixed-pod exports and future aggregate views. */
  pod?: string;
  level: LogLevel;
  levelSource: LevelSource;
  isJson: boolean;
  isLogfmt: boolean;
}
