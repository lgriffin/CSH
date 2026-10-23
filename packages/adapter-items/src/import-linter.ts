// import-linter contracts (From the Toads run, section 4; stage 62): the layering a Python repository enforces with
// `lint-imports`, read from its configuration as text and never run. A told rule that names a contract is verified by
// the configuration file, as one that names a dependency-cruiser check is (A-211). CSH does not translate a contract.

/** A file that may hold an import-linter configuration, by its name. */
export const IMPORT_LINTER = /(?:^|\/)(?:pyproject\.toml|\.importlinter|setup\.cfg)$/;

export interface Contract {
  name: string;
  type: string;
  sources: string[];
  forbidden: string[];
}

/** The quoted strings of a TOML value: one string, or each string of an array. */
function strings(value: string): string[] {
  return [...value.matchAll(/"((?:[^"\\]|\\.)*)"|'([^']*)'/g)].map((m) => m[1] ?? m[2]!);
}

/** The contracts of a `pyproject.toml` (`[[tool.importlinter.contracts]]`), or of an INI file (`[importlinter:contract:…]`). */
export function importContracts(path: string, text: string): Contract[] {
  const lines = text.split(/\r?\n/);
  const out: Contract[] = [];
  if (path.endsWith(".toml")) {
    if (!/^\s*\[tool\.importlinter\]/m.test(text) && !/^\s*\[\[tool\.importlinter\.contracts\]\]/m.test(text)) return [];
    let at = -1;
    while ((at = lines.findIndex((l, i) => i > at && /^\s*\[\[tool\.importlinter\.contracts\]\]\s*(?:#.*)?$/.test(l))) >= 0) {
      const fields = new Map<string, string>();
      let key: string | undefined;
      let depth = 0;
      for (let i = at + 1; i < lines.length; i++) {
        const l = lines[i]!.replace(/\s+#.*$/, "");
        if (key === undefined && /^\s*\[/.test(l)) break;
        if (key === undefined) {
          const m = /^\s*([\w-]+)\s*=\s*(.*)$/.exec(l);
          if (m === null) continue;
          key = m[1]!;
          fields.set(key, m[2]!);
          depth = (m[2]!.match(/\[/g) ?? []).length - (m[2]!.match(/\]/g) ?? []).length;
        } else {
          fields.set(key, `${fields.get(key)!} ${l}`);
          depth += (l.match(/\[/g) ?? []).length - (l.match(/\]/g) ?? []).length;
        }
        if (depth <= 0) key = undefined;
      }
      out.push({ name: strings(fields.get("name") ?? "")[0] ?? "", type: strings(fields.get("type") ?? "")[0] ?? "", sources: strings(fields.get("source_modules") ?? ""), forbidden: strings(fields.get("forbidden_modules") ?? "") });
    }
    return out;
  }
  // INI: a section per contract, each list one value per indented line (or separated by commas on one line).
  let cur: Map<string, string[]> | undefined;
  let key: string | undefined;
  const flush = () => {
    if (cur === undefined) return;
    const one = (k: string) => (cur!.get(k) ?? []).join(" ").trim();
    const list = (k: string) => (cur!.get(k) ?? []).flatMap((v) => v.split(",")).map((v) => v.trim()).filter((v) => v !== "");
    out.push({ name: one("name"), type: one("type"), sources: list("source_modules"), forbidden: list("forbidden_modules") });
  };
  for (const raw of lines) {
    const l = raw.replace(/\s+[#;].*$/, "");
    const section = /^\[([^\]]+)\]\s*$/.exec(l.trim());
    if (section !== null) {
      flush();
      cur = /^importlinter:contract:/.test(section[1]!) ? new Map() : undefined;
      key = undefined;
      continue;
    }
    if (cur === undefined || l.trim() === "") continue;
    const kv = /^([\w-]+)\s*[=:]\s*(.*)$/.exec(l);
    if (kv !== null && !/^\s/.test(l)) {
      key = kv[1]!;
      cur.set(key, kv[2]!.trim() === "" ? [] : [kv[2]!.trim()]);
    } else if (key !== undefined && /^\s/.test(l)) cur.get(key)!.push(l.trim());
  }
  flush();
  return out;
}

const words = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w !== ""));
const collapse = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
/** A module as pip and Python compare it: `-` reads as `_`, case aside. */
const moduleOf = (t: string) => t.trim().replace(/-/g, "_").toLowerCase();

/**
 * Whether a told rule's sentence names a contract (A-218): by its name up to the first parenthesis or colon; by a
 * backticked module a forbidden contract forbids, beside a word of one of its source modules that the forbidden module
 * does not share; or by saying "import contract", "import-linter" or "lint-imports" and naming the configuration file.
 */
export function namesContract(sentence: string, ticks: string[], file: string, contracts: Contract[]): boolean {
  const said = collapse(sentence);
  const ws = words(sentence.replace(/`[^`]*`/g, " "));
  const base = file.slice(file.lastIndexOf("/") + 1);
  if (/\bimport contracts?\b|\bimport-linter\b|\blint-imports\b/i.test(sentence) && ticks.some((t) => t === file || t === base)) return true;
  const named = new Set(ticks.map(moduleOf));
  for (const c of contracts) {
    const head = collapse(c.name.split(/[(:]/)[0]!);
    if (head.split(" ").length >= 3 && said.includes(head)) return true;
    if (c.type !== "forbidden") continue;
    for (const f of c.forbidden.filter((m) => named.has(m.toLowerCase()))) {
      const theirs = words(f.split(".").pop()!.replace(/_/g, " "));
      if (c.sources.some((s) => [...words(s.split(".").pop()!.replace(/_/g, " "))].some((w) => !theirs.has(w) && w.length > 2 && ws.has(w)))) return true;
    }
  }
  return false;
}
