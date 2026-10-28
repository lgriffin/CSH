// What the inventory adapters share (Ingesting a codebase, stage 22): identifier patterns, slugs, and the test for a
// backticked token that names a path of the repository.
import { compareCodePoints } from "@csh/kernel";
import type { AdapterInput } from "@csh/witness";

// Names of algorithms and encodings (SHA-256, UTF-8) look like identifiers and are never one.
export const DEFAULT_ID_PATTERN = "(?!(?:SHA|UTF|MD|AES|CRC|TLS|SSL|ISO)-[0-9])[A-Z][A-Z0-9]*-[0-9]+";

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
  // Not repository paths: a placeholder (release/vX.Y.Z, deploy/pin-X.Y.Z, A-277), a CIDR block (10.0.0.0/9) and an API group or registry host
  // (coordination.k8s.io/v1).
  if (/(?:^|[^A-Za-z0-9])v?[xX]\.[yY](?![A-Za-z0-9])|\/<|[<>{}*]/.test(t)) return undefined;
  if (/^\d+(\.\d+)+\//.test(t)) return undefined;
  // A placeholder for a number or version in a part of the path: camel-4x-upgrade-guide-4_XX.adoc, course-labs/lab-NN (A-291).
  if (/(?:^|[\/._-])(?:XX+|NN+)(?=$|[\/._-])/.test(t)) return undefined;
  if (/^[\w-]+(\.[\w-]+)*\.(?:io|com|org|net|dev)\//.test(t)) return undefined;
  // A placeholder with an ellipsis (tests/bdd/steps/...), and a branch or tag whose last segment is a version
  // (release/16.3.0, release/v16.2.2), name no path (From the tutors run, section 5).
  if (/(?:^|\/)\.{3,}(?:\/|$)|(?:\.\.\.|…)\/?$/.test(t)) return undefined;
  if (/\/v?\d+(?:\.\d+)+$/.test(t)) return undefined;
  return t;
}

/**
 * A bare file name with a code or data extension, such as `security.test.ts` (stage 25). It names a file by its name
 * alone: the trace resolves it when exactly one tracked file has that name, and leaves it unchecked otherwise.
 */
export function bareFileToken(token: string): string | undefined {
  const t = token.trim();
  return /^[\w@-][\w.@-]*\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs|py|pyi|java|go|rs|json|ya?ml|toml)$/.test(t) ? t : undefined;
}

/** Every backticked token on a line, with no nesting. */
export function backticked(line: string): string[] {
  return [...line.matchAll(/`([^`]+)`/g)].map((m) => m[1]!);
}
