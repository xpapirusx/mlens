/**
 * Split a command line into argv the way a shell would for the simple cases a
 * pod exec needs: whitespace separates words, single and double quotes group
 * them, and a backslash escapes the next character. There is no variable
 * expansion, globbing or operator handling — the Kubernetes exec API takes an
 * argv array, and everything a user types here is passed to `command` verbatim.
 *
 * kubectl/Freelens send `sh -c "clear; (bash || ash || sh)"` as three
 * arguments; sending that line as one argument makes the runtime look for a
 * binary with spaces in its name, which is the `stat …: no such file` failure
 * this parser prevents.
 */
export function splitCommandLine(input: string): string[] {
  const args: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let started = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index] ?? "";

    if (quote === "'") {
      if (char === "'") quote = null;
      else current += char;
      started = true;
      continue;
    }

    if (quote === '"') {
      if (char === '"') {
        quote = null;
      } else if (char === "\\" && index + 1 < input.length && ['"', "\\", "$", "`"].includes(input[index + 1] ?? "")) {
        index += 1;
        current += input[index] ?? "";
      } else {
        current += char;
      }
      started = true;
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      started = true;
      continue;
    }

    if (char === "\\" && index + 1 < input.length) {
      index += 1;
      current += input[index] ?? "";
      started = true;
      continue;
    }

    if (char === " " || char === "\t" || char === "\n") {
      if (started) {
        args.push(current);
        current = "";
        started = false;
      }
      continue;
    }

    current += char;
    started = true;
  }

  if (started) args.push(current);
  return args;
}

/**
 * Pod-shell command: start a shell and fall through to whichever of bash/ash/sh
 * the image ships, like kubectl/Freelens' `clear; (bash || ash || sh)`. The
 * candidates are probed with `command -v` first, so a missing one prints no
 * "not found" line and the chosen shell keeps its stderr. `clear` drops the
 * shell's startup scrollback so the tab opens clean.
 */
export const DEFAULT_POD_COMMAND =
  'sh -c "clear; (bash || ash || sh)"';

/** argv for a pod exec, or an empty list when the field is blank. */
export function podCommandArgv(input: string | undefined): string[] {
  return splitCommandLine((input ?? "").trim() || DEFAULT_POD_COMMAND);
}
