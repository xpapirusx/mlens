export function formatAge(timestamp?: string, now = Date.now()): string {
  if (!timestamp) return "–";
  const started = new Date(timestamp).getTime();
  if (Number.isNaN(started)) return "–";
  const seconds = Math.max(0, Math.round((now - started) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  const days = Math.round(hours / 24);
  return `${days}d`;
}

export function formatRelativeTime(timestamp?: string, now = Date.now()): string {
  if (!timestamp) return "–";
  const age = formatAge(timestamp, now);
  return age === "–" ? age : `${age} ago`;
}

export function formatTimestamp(timestamp?: string): string {
  if (!timestamp) return "–";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatBytes(bytes?: number): string {
  if (bytes === undefined || bytes === null || Number.isNaN(bytes)) return "–";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KiB", "MiB", "GiB", "TiB", "PiB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

/** Parses Kubernetes CPU quantities ("100m", "2", "1.5") into millicores. */
export function parseCpu(value?: string | number): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "number") return value * 1000;
  const match = /^([0-9.]+)([a-zµ]*)$/i.exec(String(value).trim());
  if (!match) return undefined;
  const amount = Number(match[1]);
  if (Number.isNaN(amount)) return undefined;
  switch (match[2]) {
    case "n":
      return amount / 1e6;
    case "u":
    case "µ":
      return amount / 1000;
    case "m":
      return amount;
    default:
      return amount * 1000;
  }
}

/** Parses Kubernetes memory quantities into bytes. */
export function parseMemory(value?: string | number): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "number") return value;
  const match = /^([0-9.]+)([a-zA-Z]*)$/.exec(String(value).trim());
  if (!match) return undefined;
  const amount = Number(match[1]);
  if (Number.isNaN(amount)) return undefined;
  const units: Record<string, number> = {
    "": 1,
    k: 1e3,
    K: 1e3,
    M: 1e6,
    G: 1e9,
    T: 1e12,
    P: 1e15,
    E: 1e18,
    Ki: 1024,
    Mi: 1024 ** 2,
    Gi: 1024 ** 3,
    Ti: 1024 ** 4,
    Pi: 1024 ** 5,
    Ei: 1024 ** 6,
  };
  return amount * (units[match[2]] ?? 1);
}

export function formatCpu(millicores?: number): string {
  if (millicores === undefined) return "–";
  if (millicores >= 1000) return `${(millicores / 1000).toFixed(millicores % 1000 === 0 ? 0 : 1)}`;
  return `${Math.round(millicores)}m`;
}

export function truncateMiddle(value: string, max = 48): string {
  if (value.length <= max) return value;
  const half = Math.floor((max - 1) / 2);
  return `${value.slice(0, half)}…${value.slice(-half)}`;
}

export function basename(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  return normalized.slice(normalized.lastIndexOf("/") + 1) || path;
}

export function titleCase(value: string): string {
  return value.replace(/[-_]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}
