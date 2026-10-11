// What the inventory adapters share (Ingesting a codebase, stage 22): identifier patterns, slugs, and the test for a
// backticked token that names a path of the repository.
import { compareCodePoints } from "@csh/kernel";
import type { AdapterInput } from "@csh/witness";

export const DEFAULT_ID_PATTERN = "[A-Z][A-Z0-9]*-[0-9]+";

/** The identifier pattern a practice sets (`idPattern`, or `requirementIdPattern` from the configuration). */
export function idPatternOf(input: AdapterInput): string {
  return input.config?.idPattern ?? input.config?.requirementIdPattern ?? DEFAULT_ID_PATTERN;
}

/** Files in code point order of path, so that output never depends on the order the harness read them in. */
export function sortedFiles(input: AdapterInput): AdapterInput["files"] {
  return [...input.files].sort((a, b) => compareCodePoints(a.path, b.path));
}

export const decode = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

/** A lower-case slug of a title: "Landmark 1 resolves" becomes "landmark-1-resolves". */
export function slug(title: string): string {
  const s = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s === "" ? "untitled" : s.slice(0, 80).replace(/-+$/, "");
}

/** A slug made unique among those already taken, by a numeric suffix. */
export function unique(base: string, taken: Set<string>): string {
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}~${n}`;
  taken.add(id);
  return id;
}

/**
 * A backticked token that names a repository path: segments of word characters, dots, at signs and hyphens joined by
 * slashes, at least one slash, optionally ending in one, read from the repository root. A glob, a placeholder, a URL,
 * a command, a package specifier and a bare file name are not paths, and neither is a token that starts with ./ or
 * ../, which prose uses for package entry points (./errors) as often as for files (A-96).
 */
export function pathToken(token: string): string | undefined {
  const t = token.trim();
  if (!/^[\w@-][\w.@-]*(\/[\w.@-]+)+\/?$/.test(t)) return undefined;
  if (t.startsWith("@")) return undefined; // a package specifier, such as @lgriffin/esi.ts
  return t;
}

/** Every backticked token on a line, with no nesting. */
export function backticked(line: string): string[] {
  return [...line.matchAll(/`([^`]+)`/g)].map((m) => m[1]!);
}
