export const api = window.mlens;

const PREFIX = /^Error invoking remote method '[^']+': (Error: )?/;

export function errorText(error: unknown): string {
  if (error instanceof Error) return error.message.replace(PREFIX, "");
  if (typeof error === "string") return error.replace(PREFIX, "");
  return "Unexpected error";
}

/** Wraps a promise so UI code gets clean, human-readable error messages. */
export async function call<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    throw new Error(errorText(error));
  }
}
