// Globs over slash-separated paths, for source locations and module selectors (Ingesting a codebase, stages 22 and 23).
// `**` spans directories, `*` and `?` stay within one segment, and nothing else is special.

/** A glob as a regular expression over a whole path. */
export function globRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === "*" && glob[i + 1] === "*") {
      const slash = glob[i + 2] === "/";
      re += slash ? "(?:.*/)?" : ".*";
      i += slash ? 2 : 1;
    } else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

/** Whether a path matches one of `globs` and none of `except`. */
export function matchesGlobs(path: string, globs: readonly string[], except: readonly string[] = []): boolean {
  return globs.some((g) => globRegExp(g).test(path)) && !except.some((g) => globRegExp(g).test(path));
}
