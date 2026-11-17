export const api = window.mlens;

const PREFIX = /^Error invoking remote method '[^']+': (Error: )?/;

/**
 * `spawn kubectl ENOENT` is the kubeconfig exec plugin (oidc-login, aws, …)
 * failing to find its binary: a GUI launch only inherits launchd's minimal
 * PATH. Main augments PATH at startup; if the binary is genuinely missing the
 * message should say so instead of showing a bare ENOENT.
 */
function withPathHint(message: string): string {
  if (!/ENOENT/i.test(message)) return message;
  const binary = /spawn (\S+) ENOENT/i.exec(message)?.[1] ?? "the required binary";
  return (
    `${message}\n\n"${binary}" was not found on PATH. A kubeconfig exec plugin needs it ` +
    `(kubectl oidc-login, aws, gke-gcloud-auth-plugin, …). mLens already adds /etc/paths, ` +
    `Homebrew (/opt/homebrew/bin, /usr/local/bin) and your login-shell PATH at startup — ` +
    `install the binary or add its directory to PATH.`
  );
}

/** Wraps a promise so UI code gets clean, human-readable error messages. */
export async function call<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    throw new Error(errorText(error));
  }
}

export function errorText(error: unknown): string {
  if (error instanceof Error) return withPathHint(error.message.replace(PREFIX, ""));
  if (typeof error === "string") return withPathHint(error.replace(PREFIX, ""));
  return "Unexpected error";
}
