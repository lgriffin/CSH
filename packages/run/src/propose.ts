// csh init --subject (From real runs, section 1): propose a profile from a checkout's tracked files. Plain csh init
// guesses nothing (P10); this guesses, so every guess is returned with what it was read from, to be printed beside the
// manifest. Nothing here writes a file.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { COMPONENT_SCHEMA_V2, type ComponentManifest, type DeclaredSource, type Practice } from "@csh/component";
import { isBaseline } from "@csh/adapter-items/markdown";
import { compareCodePoints, globRegExp } from "@csh/kernel";
import { trackedFiles } from "./sources.ts";

export interface Proposal {
  manifest: ComponentManifest;
  /** Each guess, with what it was read from. */
  guesses: string[];
}

/** Directories never proposed for any source: installed, built or vendored files. */
// A Python virtual environment is installed code, as node_modules is, even when someone committed it (stage 46).
export const NEVER_PROPOSED = ["node_modules", "dist", "build", "out", "coverage", "vendor", "target", ".venv", "venv", "site-packages", "__pycache__"];
const NEVER_GLOBS = NEVER_PROPOSED.map((d) => `**/${d}/**`);

/** A pattern that matches no text: the citations of tests in a repository with no identifier scheme (A-221). */
export const NO_CITATION = "(?!)";

/** Prefixes of identifiers that belong to the world, not to the repository: UTF-8, SHA-256, RFC-9110. */
export const EXTERNAL_FAMILIES = ["UTF", "SHA", "ISO", "RFC", "CVE", "AES", "RSA", "TLS", "SSL", "HTTP", "ES", "ECMA", "PEP", "JSR", "GPL", "LGPL", "AGPL", "MIT", "BSD", "CC"];

const CODE_EXT = ["ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs", "svelte", "py", "pyi", "java", "go", "rs"];
const JS_EXT = ["ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs"];
/** Language manifests read as code: at the root, and since stage 55 at any depth (a Maven module, a nested Go module). */
const MANIFESTS = ["package.json", "pyproject.toml", "pom.xml", "go.mod", "go.work", "Cargo.toml"];
const TEST_DIRS = ["test", "tests", "__tests__"];
/** The files an agent's tooling loads at the start of every session, by name, anywhere in the tree (stage 50). */
export const INSTRUCTION_FILES = ["AGENTS.md", "CLAUDE.md", "GEMINI.md"];

/** A dependency-cruiser configuration, by its file name. */
const DEPENDENCY_CRUISER = /^\.dependency-cruiser\.(?:c?js|mjs|json)$/;

export { isBaseline };

const segments = (p: string) => p.split("/");
const ext = (p: string) => {
  const b = posix.basename(p);
  const i = b.lastIndexOf(".");
  return i <= 0 ? "" : b.slice(i + 1);
};
const never = (p: string) => segments(p).slice(0, -1).some((s) => NEVER_PROPOSED.includes(s));
const underAny = (p: string, dirs: string[]) => segments(p).slice(0, -1).some((s) => dirs.includes(s));

/** A test file's convention, as the glob that selects every file of it; undefined for a file that is not one. */
function testConvention(p: string): string | undefined {
  const b = posix.basename(p);
  const m = /\.(test|spec)\.([a-z]+)$/.exec(b);
  if (m !== null && JS_EXT.includes(m[2]!)) return `**/*.${m[1]}.${m[2]}`;
  if (/^test_.*\.py$/.test(b)) return "**/test_*.py";
  if (/_test\.py$/.test(b)) return "**/*_test.py";
  if (/Test\.java$/.test(b)) return "**/*Test.java";
  if (/Tests\.java$/.test(b)) return "**/*Tests.java";
  if (/_test\.go$/.test(b)) return "**/*_test.go";
  if (ext(p) === "rs" && underAny(p, ["tests"])) return "**/tests/**/*.rs";
  return undefined;
}

/** A step definition file's convention, as a glob; undefined for any other file. */
function stepConvention(p: string): string | undefined {
  const e = ext(p);
  // A behave step file is Python in a steps directory beside the features (From the Toads run, section 3).
  if (e === "py" && underAny(p, ["steps"]) && !/^test_|_test\.py$/.test(posix.basename(p))) return "**/steps/**/*.py";
  if (!JS_EXT.includes(e)) return undefined;
  if (/\.steps\.[a-z]+$/.test(posix.basename(p))) return `**/*.steps.${e}`;
  if (underAny(p, ["step_definitions"])) return `**/step_definitions/**/*.${e}`;
  if (underAny(p, ["steps"])) return `**/steps/**/*.${e}`;
  return undefined;
}

const matches = (p: string, globs: string[]) => globs.some((g) => globRegExp(g).test(p));

/**
 * Include and exclude globs that select exactly `intended` out of `universe`: the given includes (or one glob per
 * top-level directory and extension), less the given excludes, then any file still selected wrongly named by itself.
 */
function globsFor(intended: string[], universe: string[], include?: string[], exclude: string[] = []): { include: string[]; exclude: string[] } {
  const inc = include ?? [...new Set(intended.map((p) => (p.includes("/") ? `${segments(p)[0]}/**/*.${ext(p)}` : `*.${ext(p)}`)))].sort(compareCodePoints);
  const exc = [...NEVER_GLOBS, ...exclude.filter((g) => universe.some((p) => globRegExp(g).test(p) && !intended.includes(p)))];
  const want = new Set(intended);
  const picked = (p: string) => matches(p, inc) && !matches(p, exc);
  const extras = universe.filter((p) => picked(p) && !want.has(p));
  const missing = intended.filter((p) => !picked(p) && !extras.includes(p));
  return { include: [...inc, ...missing], exclude: [...exc, ...extras] };
}

/**
 * The identifier families of the documents: prefix, how many different identifiers, how many mentions. A two-part
 * identifier such as `R-FLOW-1` is counted first, in the family `R-[A-Z]+`, and blanked, so that `FLOW-1` inside it is
 * not counted again (The Assertion Ladder, stage 50).
 */
function families(texts: string[]): { prefix: string; ids: number; mentions: number }[] {
  const by = new Map<string, { ids: Set<string>; mentions: number; head: string }>();
  const count = (prefix: string, head: string, id: string) => {
    const f = by.get(prefix) ?? { ids: new Set(), mentions: 0, head };
    f.ids.add(id);
    f.mentions++;
    by.set(prefix, f);
  };
  for (const t of texts) {
    const rest = t.replace(/\b([A-Z]{1,5})-([A-Z]{2,8})-([0-9]+)\b/g, (id: string, head: string) => {
      count(`${head}-[A-Z]+`, head, id);
      return " ".repeat(id.length);
    });
    for (const m of rest.matchAll(/\b([A-Z]{2,5})-([0-9]+)\b/g)) count(m[1]!, m[1]!, m[0]);
  }
  return [...by]
    .filter(([, f]) => f.ids.size >= 2 && !EXTERNAL_FAMILIES.includes(f.head))
    .map(([prefix, f]) => ({ prefix, ids: f.ids.size, mentions: f.mentions }))
    .sort((a, b) => b.mentions - a.mentions || compareCodePoints(a.prefix, b.prefix));
}

/**
 * The identifier pattern of the families: every prefix named, however many. A shape such as `[A-Z]{2,4}-[0-9]{3}`
 * would also match UTF-8 and RFC-2119, which are excluded, so the alternation is kept whole; the guess names only the
 * first eight (From real runs, stage 46).
 */
export function idPatternOf(fams: { prefix: string }[]): string | undefined {
  return fams.length === 0 ? undefined : `(?:${fams.map((f) => f.prefix).join("|")})-[0-9]+`;
}

/** The tags of each Rule, Scenario or Example of a feature file, and of the Feature itself. */
function tagsOf(text: string): { keyword: string; tags: string[] }[] {
  const out: { keyword: string; tags: string[] }[] = [];
  let pending: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const l = raw.trim();
    if (l === "" || l.startsWith("#")) continue;
    if (l.startsWith("@")) {
      pending.push(...l.split(/\s+/).filter((t) => t.startsWith("@")));
      continue;
    }
    const k = /^(Feature|Rule|Scenario Outline|Scenario Template|Scenario|Example)\s*:/.exec(l);
    if (k !== null && pending.length > 0) out.push({ keyword: k[1]!, tags: pending });
    pending = [];
  }
  return out;
}

const git = (dir: string, ...args: string[]): string | undefined => {
  try {
    return execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return undefined;
  }
};

export interface ProposeOptions {
  /**
   * Lift told rules from the documents (Analyse, danger and grain, stage 55): every Markdown practice reads its layering
   * and EARS sentences as items, with the setting `told: sentences`. Set by `csh analyse`, never by `csh init`.
   */
  lift?: boolean;
}

/** A profile for the checkout at `dir`, or why there is none. */
export function proposeProfile(dir: string, o: ProposeOptions = {}): Proposal | { error: string } {
  const tracked = trackedFiles(dir);
  const commit = git(dir, "rev-parse", "HEAD");
  if (tracked === undefined || commit === undefined) return { error: `${dir} is not a git checkout with a commit` };
  const files = tracked.filter((p) => !never(p));
  const read = (p: string) => {
    try {
      return readFileSync(join(dir, p), "utf8");
    } catch {
      return "";
    }
  };
  const guesses: string[] = [];
  const origin = git(dir, "remote", "get-url", "origin");
  if (origin === undefined || origin === "") guesses.push(`subject.repo ${dir}: the checkout has no origin remote, so the manifest names a local path and is not portable`);
  else guesses.push(`subject.repo ${origin}: the checkout's origin remote; subject.commit is its HEAD`);

  // A fixture, or a file under a dot-directory (.claude, .github), is test data or tooling, not the project's own.
  const fixtures = (p: string) => underAny(p, ["fixtures", "__fixtures__"]) || segments(p).slice(0, -1).some((d) => d.startsWith("."));
  const markdown = files.filter((p) => ext(p) === "md");
  // A feature file in a fixture is test data for the subject's own tooling (From the tutors run, section 3).
  const allFeatures = files.filter((p) => ext(p) === "feature");
  const features = allFeatures.filter((p) => !fixtures(p));
  const featureText = new Map(features.map((p) => [p, read(p)]));
  const mdText = new Map(markdown.map((p) => [p, read(p)]));
  const fams = families([...mdText.values(), ...featureText.values()]);
  const idPattern = idPatternOf(fams);
  const named = fams.slice(0, 8).map((f) => `${f.prefix} (${f.ids} identifiers, ${f.mentions} mentions)`).join(", ");
  if (idPattern !== undefined) guesses.push(`idPattern ${idPattern}: ${named}${fams.length > 8 ? ` and ${fams.length - 8} more prefixes` : ""} in the Markdown and Gherkin files`);
  else guesses.push("no idPattern: no prefix names two or more identifiers in the Markdown and Gherkin files, so each adapter keeps its default");
  const idSettings = idPattern === undefined ? {} : { idPattern };

  const sources: DeclaredSource[] = [];
  const practices: Practice[] = [];
  const add = (s: DeclaredSource, p: Omit<Practice, "sources">) => {
    sources.push(s);
    practices.push({ ...p, sources: [s.name] });
  };

  // A dependency-cruiser configuration names the checks a told rule may cite (From the tutors run, section 6). Every
  // Markdown source reads it, since a told rule may sit in any of them; the adapter reads only its check names.
  // An import-linter configuration names the contracts a told rule may name, read the same way (From the Toads run,
  // section 4): a pyproject.toml with a [tool.importlinter] table, an .importlinter, or a setup.cfg with [importlinter].
  const linters = files.filter((p) => !fixtures(p) && ((posix.basename(p) === "pyproject.toml" && /^\s*\[tool\.importlinter\]/m.test(read(p))) || posix.basename(p) === ".importlinter" || (posix.basename(p) === "setup.cfg" && /^\s*\[importlinter\]/m.test(read(p)))));
  const cruisers = [...files.filter((p) => DEPENDENCY_CRUISER.test(posix.basename(p)) && !underAny(p, ["fixtures", "__fixtures__"])), ...linters];

  // Instructions: the files an agent reads at the start of every session (The Assertion Ladder, stage 50).
  const instructions = markdown.filter((p) => INSTRUCTION_FILES.includes(posix.basename(p)) || p === ".github/copilot-instructions.md");
  if (instructions.length > 0) {
    add({ name: "Instructions", kind: "Documents", at: ".", include: [...instructions, ...cruisers] }, { id: "instructions", name: "Instructions", kind: "instructions", unit: "the instruction file", settings: { ...idSettings } });
    guesses.push(`Instructions: ${instructions.length} ${instructions.length === 1 ? "file" : "files"} an agent reads at the start of a session (${instructions.join(", ")}), read as documents in a practice of their own`);
  }

  // Requirements: Markdown files with a heading, or a table row, that begins with an identifier.
  const heading = idPattern === undefined ? undefined : new RegExp(`^#{1,6}\\s+(?:${idPattern})\\b`, "m");
  const tableRow = idPattern === undefined ? undefined : new RegExp(`^\\s*\\|\\s*(?:${idPattern})\\s*\\|`, "m");
  const requirements = heading === undefined || tableRow === undefined ? [] : markdown.filter((p) => !instructions.includes(p) && (heading.test(mdText.get(p)!) || tableRow.test(mdText.get(p)!)));
  if (requirements.length > 0) {
    add({ name: "Requirements", kind: "Documents", at: ".", include: [...requirements, ...cruisers] }, { id: "requirements", name: "Requirements", kind: "requirements", adapter: "@csh/adapter-items/markdown", unit: "the requirement", settings: { ...idSettings } });
    guesses.push(`Requirements: ${requirements.length} Markdown ${requirements.length === 1 ? "file has a heading or table row" : "files have headings or table rows"} that begin with an identifier, e.g. ${requirements[0]}`);
  }

  // Documents: every other Markdown file, less changelogs and those in test directories.
  const changelog = (p: string) => /^(CHANGELOG|HISTORY)/i.test(posix.basename(p));
  const documents = markdown.filter((p) => !requirements.includes(p) && !instructions.includes(p) && !changelog(p) && !underAny(p, TEST_DIRS));
  if (documents.length > 0) {
    const g = globsFor(documents, files, undefined, ["**/CHANGELOG*", "**/HISTORY*", ...TEST_DIRS.map((d) => `**/${d}/**`), ...requirements, ...instructions]);
    add({ name: "Documents", kind: "Documents", at: ".", include: [...g.include, ...cruisers], exclude: g.exclude }, { id: "docs", name: "Documents", kind: "documents", unit: "the document", settings: { ...idSettings } });
    guesses.push(`Documents: ${documents.length} other Markdown files, leaving out changelogs and test directories`);
  }
  const cruiserFiles = cruisers.filter((p) => !linters.includes(p));
  if (cruiserFiles.length > 0 && sources.some((s) => s.include?.some((p) => cruiserFiles.includes(p)))) guesses.push(`${cruiserFiles.join(", ")}: a dependency-cruiser configuration, read for the names of the checks it defines`);
  if (linters.length > 0 && sources.some((s) => s.include?.some((p) => linters.includes(p)))) guesses.push(`${linters.join(", ")}: an import-linter configuration, read for the contracts it defines`);
  // Baselines: text files a repository says may only shrink, the gaps it already records (section 6). They belong to
  // the documents practice, made for them when no other document is read.
  const baselines = files.filter((p) => ext(p) === "txt" && !fixtures(p) && isBaseline(read(p)));
  if (baselines.length > 0) {
    if (!practices.some((p) => p.id === "docs")) practices.push({ id: "docs", name: "Documents", kind: "documents", unit: "the document", sources: [], settings: { ...idSettings } });
    sources.push({ name: "Baselines", kind: "Documents", at: ".", include: [...baselines] });
    practices.find((p) => p.id === "docs")!.sources.push("Baselines");
    guesses.push(`Baselines: ${baselines.join(", ")}, ${baselines.length === 1 ? "a file that says" : "files that say"} it may only shrink, each entry a gap the repository records`);
  }

  // Features, with their tags read by family.
  if (features.length > 0) {
    const settings: Record<string, string> = {};
    const tagged = [...featureText.values()].flatMap(tagsOf);
    const byFamily = new Map<string, { written: Map<string, number>; values: Map<string, { n: number; onRule: number }> }>();
    for (const t of tagged) {
      for (const tag of t.tags) {
        const m = /^@([A-Za-z]+)-[0-9]+$/.exec(tag);
        if (m === null) continue;
        const key = m[1]!.toLowerCase();
        const f = byFamily.get(key) ?? { written: new Map(), values: new Map() };
        f.written.set(m[1]!, (f.written.get(m[1]!) ?? 0) + 1);
        const v = f.values.get(tag.toLowerCase()) ?? { n: 0, onRule: 0 };
        v.n++;
        if (t.keyword !== "Feature") v.onRule++;
        f.values.set(tag.toLowerCase(), v);
        byFamily.set(key, f);
      }
    }
    const docFamilies = new Set(fams.map((f) => f.prefix.toLowerCase()));
    const writtenOf = (k: string) => [...byFamily.get(k)!.written].sort((a, b) => b[1] - a[1] || compareCodePoints(a[0], b[0]))[0]![0];
    const own = [...byFamily]
      .filter(([k, f]) => !docFamilies.has(k) && f.values.size >= 2 && [...f.values.values()].every((v) => v.n === 1 && v.onRule === 1))
      .sort((a, b) => b[1].values.size - a[1].values.size || compareCodePoints(a[0], b[0]));
    if (own.length > 0) {
      settings.idTag = `(${writtenOf(own[0]![0])}-[0-9]+)`;
      guesses.push(`idTag ${settings.idTag}: each of its ${own[0]![1].values.size} tags names exactly one Rule or Scenario`);
    }
    const citing = [...byFamily.keys()].filter((k) => docFamilies.has(k)).sort(compareCodePoints);
    if (citing.length > 0) {
      const w = citing.map(writtenOf);
      settings.tagCites = w.length === 1 ? `(${w[0]}-[0-9]+)` : `((?:${w.join("|")})-[0-9]+)`;
      guesses.push(`tagCites ${settings.tagCites}: the documents' identifiers appear as scenario tags`);
    }
    const left = allFeatures.filter((p) => fixtures(p));
    add({ name: "Features", kind: "Features", at: ".", include: ["**/*.feature"], exclude: [...NEVER_GLOBS, ...(left.length > 0 ? ["**/fixtures/**", "**/__fixtures__/**", "**/.*/**"] : [])] }, { id: "bdd", name: "BDD", kind: "scenarios", unit: "the rule", ...(Object.keys(settings).length > 0 ? { settings } : {}) });
    guesses.push(`Features: ${features.length} .feature files${left.length > 0 ? `, leaving out ${left.length} in fixtures or dot-directories, which are test data` : ""}`);
  }

  // Tests by their runners' conventions, and step definitions beside features.
  const tests = files.filter((p) => testConvention(p) !== undefined && !fixtures(p));
  const steps = features.length === 0 ? [] : files.filter((p) => testConvention(p) === undefined && stepConvention(p) !== undefined && !fixtures(p));
  const testGlobs = [...new Set(tests.map((p) => testConvention(p)!))].sort(compareCodePoints);
  const stepGlobs = [...new Set(steps.map((p) => stepConvention(p)!))].sort(compareCodePoints);
  const deps = files
    .filter((p) => posix.basename(p) === "package.json")
    .flatMap((p) => {
      try {
        const j = JSON.parse(read(p)) as Record<string, unknown>;
        return [j.dependencies, j.devDependencies].flatMap((d) => (typeof d === "object" && d !== null ? Object.keys(d) : []));
      } catch {
        return [];
      }
    });
  const runner = deps.includes("vitest") ? "vitest" : deps.includes("jest") ? "jest" : undefined;
  // pytest-bdd binds scenarios and defines steps in test modules and conftest.py files (From the Toads run, section 3).
  const pytestBdd = features.length === 0 ? [] : tests.filter((p) => ext(p) === "py" && /^[ \t]*(?:from\s+pytest_bdd(?:\.\w+)*\s+import|import\s+pytest_bdd)\b/m.test(read(p)));
  const conftests = pytestBdd.length === 0 ? [] : files.filter((p) => posix.basename(p) === "conftest.py" && !fixtures(p) && !never(p));
  if (tests.length + steps.length > 0) {
    const testPractice: Omit<Practice, "sources"> = { id: "tdd", name: "TDD", kind: "tests", unit: "the test file", settings: { ...idSettings } };
    // With no scheme, a test title's PREFIX-number (WTF-8, JIRA-123) names nothing the repository defines, so it cites
    // nothing (From the TypeScript run, section 2).
    if (idPattern === undefined) {
      testPractice.settings!.citePattern = NO_CITATION;
      guesses.push("tests cite nothing: with no identifier scheme, an identifier in a test's title names nothing the repository defines");
    }
    if (steps.length > 0) {
      testPractice.settings!.style = "cucumber";
      guesses.push(`style cucumber: ${steps.length} step definition ${steps.length === 1 ? "file" : "files"} beside the features, e.g. ${steps[0]}`);
    } else if (pytestBdd.length > 0) {
      testPractice.settings!.style = "cucumber";
      guesses.push(`style cucumber: ${pytestBdd.length} test ${pytestBdd.length === 1 ? "file imports" : "files import"} pytest_bdd, which binds the features' scenarios and defines their steps, e.g. ${pytestBdd[0]}${conftests.length > 0 ? `; ${conftests.length} conftest.py ${conftests.length === 1 ? "file is" : "files are"} read for steps too` : ""}`);
    }
    if (Object.keys(testPractice.settings!).length === 0) delete testPractice.settings;
    if (runner !== undefined) {
      testPractice.executions = "csh/results.json";
      const report = `${runner}.json`;
      const command = runner === "vitest" ? `npx vitest run --reporter=json --outputFile=${report}` : `npx jest --json --outputFile=${report}`;
      guesses.push(`executions csh/results.json: package.json names ${runner}; in the subject run ${command}, then csh results import tdd <subject>/${report}`);
    }
    add({ name: "Tests", kind: "TestFiles", at: ".", ...globsFor([...tests, ...steps, ...conftests], files, [...testGlobs, ...stepGlobs, ...(conftests.length > 0 ? ["**/conftest.py"] : [])], ["**/fixtures/**", "**/__fixtures__/**"]) }, testPractice);
    guesses.push(`Tests: ${tests.length} files by the conventions ${testGlobs.join(", ") || "none"}${steps.length > 0 ? `, and ${steps.length} step definition files` : ""}`);
  }

  // Code: every file CSH reads facts from that is not a test, plus the language manifests at the root.
  // A JavaScript step file stays out of Code by its convention; a Python one only when it is read as a step file, since
  // a `steps` package is ordinary code where no feature file is.
  const stepSet = new Set(steps);
  const stepFile = (p: string) => stepSet.has(p) || (ext(p) !== "py" && stepConvention(p) !== undefined);
  const code = files.filter((p) => CODE_EXT.includes(ext(p)) && testConvention(p) === undefined && !stepFile(p) && !fixtures(p));
  // A nested manifest names a module of its own; one in a fixture or a dot-directory is test data or tooling.
  const manifests = files.filter((p) => MANIFESTS.includes(posix.basename(p)) && !fixtures(p) && (p.includes("/") ? !underAny(p, TEST_DIRS) : true));
  if (code.length > 0) {
    const g = globsFor(code, files, undefined, [...testGlobs, ...stepGlobs, "**/fixtures/**", "**/__fixtures__/**"]);
    add({ name: "Code", kind: "Code", at: ".", include: [...g.include, ...manifests], exclude: g.exclude }, { id: "code", name: "Code facts", kind: "facts", unit: "the module" });
    guesses.push(`Code: ${code.length} source files in ${[...new Set(code.map((p) => ext(p)))].sort(compareCodePoints).join(", ")}${manifests.length > 0 ? `, and ${manifests.join(", ")}` : ""}`);
  }

  // A Mermaid container diagram in a file of its own (stage 55): the first line that is not blank or a comment says C4Container.
  const diagrams = files.filter((p) => ext(p) === "mmd" && !fixtures(p) && read(p).split(/\r?\n/).map((l) => l.trim()).find((l) => l !== "" && !l.startsWith("%%")) === "C4Container");
  if (diagrams.length > 0) {
    add({ name: "Architecture", kind: "Architecture", at: ".", include: [...diagrams] }, { id: "c4", name: "Container diagram", kind: "architecture", unit: "the relation" });
    guesses.push(`Architecture: ${diagrams.join(", ")}, a Mermaid C4Container diagram, read against the code's packages`);
  }
  const implementation = [...new Set(code.map((p) => (p.includes("/") ? segments(p)[0]! : p)))].sort(compareCodePoints);

  if (tracked.includes(".beads/issues.jsonl")) {
    add({ name: "Issues", kind: "Issues", at: ".beads/issues.jsonl" }, { id: "issues", name: "Issues", kind: "issues", unit: "the issue", settings: { ...idSettings } });
    guesses.push("Issues: .beads/issues.jsonl");
  }
  if (o.lift === true) {
    const reading = practices.filter((p) => p.kind === "documents" || p.kind === "requirements" || p.kind === "instructions");
    for (const p of reading) p.settings = { ...(p.settings ?? {}), told: "sentences" };
    if (reading.length > 0) guesses.push(`told sentences: the layering and EARS sentences of ${reading.map((p) => p.name).join(", ")} are read as told rules, each at its line`);
  }
  for (const p of practices) if (p.settings !== undefined && Object.keys(p.settings).length === 0) delete p.settings;

  const name = (() => {
    const pkg = files.includes("package.json") ? (JSON.parse(read("package.json") || "{}") as { name?: unknown }).name : undefined;
    const raw = typeof pkg === "string" && pkg !== "" ? pkg.replace(/^@[^/]+\//, "") : posix.basename(dir.split("\\").join("/"));
    return raw.replace(/(^|[^A-Za-z0-9])([A-Za-z0-9])/g, (_, _s, c: string) => c.toUpperCase()).replace(/[^A-Za-z0-9]/g, "") || "Subject";
  })();
  const manifest: ComponentManifest = {
    schema: COMPONENT_SCHEMA_V2,
    name,
    subject: { repo: origin === undefined || origin === "" ? dir : origin, commit },
    implementation,
    sources,
    practices,
  };
  return { manifest, guesses };
}
