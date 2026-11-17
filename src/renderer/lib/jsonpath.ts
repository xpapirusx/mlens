/**
 * Minimal JSONPath reader for CRD printer columns (`additionalPrinterColumns`).
 *
 * The API convention writes those paths in three shapes and the Kubernetes
 * documentation uses a predicate for condition-based columns:
 *
 *   .status.ready                       plain path
 *   {.status.ready}                     the braced form some CRDs use
 *   $.status.ready                      the leading-`$` form
 *   .status.conditions[?(@.type=='Ready')].status
 *                                       predicate — the `.` inside `@.type`
 *                                       must not split the token, which is
 *                                       what a naive `split(".")` does and
 *                                       why such a column rendered nothing
 *
 * Anything it cannot walk returns undefined; the caller shows "–" rather than
 * guessing.
 */
export function readJsonPath(root: unknown, jsonPath: string): unknown {
  if (!jsonPath) return undefined;
  const clean = jsonPath
    .trim()
    .replace(/^\{/, "")
    .replace(/\}$/, "")
    .replace(/^\$\.?/, "")
    .replace(/^\./, "");
  if (!clean) return root;

  let current: unknown = root;
  for (const token of splitJsonPath(clean)) {
    if (current === null || current === undefined) return undefined;

    // field[?(@.key=='value')] / field[?(@.key!=value)]
    const predicate = /^([^\[]+)\[\?\(@\.([\w$-]+)\s*(===|==|!=)\s*(.+?)\)\]$/.exec(token);
    if (predicate) {
      const [, field, key, operator, rawValue] = predicate;
      const wanted = rawValue.trim().replace(/^["']|["']$/g, "");
      const list = (current as Record<string, unknown>)[field];
      if (!Array.isArray(list)) return undefined;
      const match = list.find((entry) => {
        if (!entry || typeof entry !== "object") return false;
        const actual = String((entry as Record<string, unknown>)[key] ?? "");
        return operator === "!==" || operator === "!=" ? actual !== wanted : actual === wanted;
      });
      if (match === undefined) return undefined;
      current = match;
      continue;
    }

    // field, optionally with one or more numeric indices: envoyHosts[0].address
    const indexed = /^([^[\]]+)((?:\[\d+\])*)$/.exec(token);
    if (indexed) {
      current = (current as Record<string, unknown>)[indexed[1]];
      for (const index of indexed[2].match(/\d+/g) ?? []) {
        if (current === null || current === undefined) return undefined;
        current = (current as unknown[])[Number(index)];
      }
      continue;
    }

    // A bare leading index: [0].address
    const bare = /^\[(\d+)\]$/.exec(token);
    if (bare) {
      if (!Array.isArray(current)) return undefined;
      current = current[Number(bare[1])];
      continue;
    }

    return undefined;
  }
  return current;
}

/** Splits on "." while keeping bracketed segments (predicates, indices) whole. */
function splitJsonPath(path: string): string[] {
  const tokens: string[] = [];
  let depth = 0;
  let buffer = "";
  for (const char of path) {
    if (char === "[") depth += 1;
    else if (char === "]") depth -= 1;
    if (char === "." && depth === 0) {
      if (buffer) tokens.push(buffer);
      buffer = "";
      continue;
    }
    buffer += char;
  }
  if (buffer) tokens.push(buffer);
  return tokens;
}
