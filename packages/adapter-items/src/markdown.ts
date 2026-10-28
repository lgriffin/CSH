// The Markdown inventory adapter (Ingesting a codebase, stage 22). Each file is one document item. A heading that
// opens with an identifier is one item of kind requirement: its first paragraph is its text, the parts of the heading
// after the identifier are fields, and each "- **Name:** value" bullet under it is a field. The mechanisms the first
// sentence of its "Verified by" field names in backticks become verified-by edges; an "**Implements:**" line becomes
// implements edges from the document; any other backticked repository path, or bare code file name (stage 25), becomes
// a mentions-file edge, as does the relative target of a link (stage 63). It reads
// structure and never meaning: a requirement whose verification is prose alone simply has no verified-by edge.
import { claimOf, classify } from "@csh/adapter-ears-markdown";
import { digestOf } from "@csh/kernel";
import { posix } from "node:path";
import type { Adapter, AdapterInput, AdapterOutput, Diagnostic, ItemEdge, SourceItem } from "@csh/witness";
import { backticked, bareFileToken, decode, idPatternOf, pathToken, slug, sortedFiles, unique } from "./common.ts";
import { type Contract, IMPORT_LINTER, importContracts, namesContract } from "./import-linter.ts";
import { sentencesOf, toldSentences, unquoted } from "./told.ts";

export const manifest = {
  id: "csh.adapter.items.markdown",
  version: "0.1.0",
  ir: "csh-ir/v1",
  produces: ["items", "edges"],
  inputKinds: ["Requirements", "Documents"],
} as const;

/** A field name as an attribute key: "Verified by" becomes "verified-by". */
const key = (name: string) => name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const plain = (s: string) => s.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();

/** The first sentence of a field's value: up to the first full stop outside backticks that ends a sentence. */
export function firstSentence(value: string): string {
  let inTick = false;
  for (let i = 0; i < value.length; i++) {
    const c = value[i]!;
    if (c === "`") inTick = !inTick;
    else if (!inTick && c === "." && (i + 1 === value.length || /\s/.test(value[i + 1]!))) return value.slice(0, i + 1);
  }
  return value;
}

interface Open {
  item: SourceItem;
  level: number;
  paragraph: string[];
  /** Done with the first paragraph: a bullet, a blank line after text, or a sub-heading came. */
  textDone: boolean;
  field?: string;
}

const CODE_FILE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|py|pyi|java|go|rs)$/;

/** A dependency-cruiser configuration, by its file name (From the tutors run, section 6). */
const DEPENDENCY_CRUISER = /(?:^|\/)\.dependency-cruiser\.(?:c?js|mjs|json)$/;

/**
 * A sentence that says the file it names is absent (From the tutors run, section 5): retired, removed, optional, a
 * leftover, or none committed. It is read with its backticked tokens left out, so `api/delete.ts` says nothing, and
 * "used to" is the past ("two scripts used to point at"), not a purpose ("is used to configure"). A file folded or merged
 * into another, a former one, or one a configuration excludes is absent too (stage 79, A-279).
 */
const ABSENT = /\b(?:retired|removed|deleted|no longer|leftover|optional|none is|former(?:ly)?|folded|folds|merged|superseded|exclud(?:e|es|ed|ing)|(?<!\b(?:is|are|was|were|be|been|being|gets?|got)\s+)used to|absent)\b/i;

/**
 * A verb of making right before a backticked path (From the TypeScript run, section 1): "Create `x.ts`", "create a new
 * file `x.ts`", "the build writes `out/report.json`". The sentence makes the file, so its being missing is expected.
 * The past ("we created `x.ts`") says the file is there, and so does a negated verb ("do not touch `x.ts`").
 */
const MAKES = /\b(?:create|creates|touch|scaffold|generate|generates|write|writes)(?:\s+(?:a|an|the|new|empty|file))*(?:\s+(?:called|named))?\s*$/i;
/**
 * A name shaped as code names are (Symbols in prose, and task runners, section 1): camelCase or PascalCase of at least
 * two words, a lower-case letter followed by a capital somewhere, optionally called with `()`.
 */
const CODE_NAME = /^([A-Za-z][A-Za-z0-9]*[a-z][A-Z][A-Za-z0-9]*|[a-z][A-Z][A-Za-z0-9]*)(?:\(\))?$/;
/**
 * A sentence about what is not built yet (Symbols in prose, and task runners, section 2): one that says planned, a
 * phased plan, plans to, roadmap, upcoming, not yet, yet to, to come, in the future, or TODO. "Next" alone is not
 * enough: "Next, run `make x`" is an instruction.
 */
const PLANNED = /\b(?:planned|phased plan|plans? to|roadmap|upcoming|not yet|yet to|to come|in (?:the )?future|TODO)\b/i;
/** A change log, whose names are of code as it was. */
const CHANGE_LOG = /^(?:CHANGELOG|CHANGES|HISTORY|NEWS|RELEASES)(?:\.[^/]*)?$/i;
/**
 * A task runner's command and its task (section 2): the first word after `hereby`, `npx hereby`, `make` or `just`, when
 * it is not an option, up to the end of the token or a space.
 */
const TASK_COMMAND = /^(?:npx\s+)?(hereby|make|just)\s+([\w:.\/][\w:.\/-]*)(?=$|\s)/;

/** `pnpm test:runway` and `yarn lint` run a script without `run` (stage 79, A-280), unless the word is the tool's own. */
const SHORT_SCRIPT = /^(?:pnpm|yarn) ([\w][\w:.\-]*)(?=$|\s)/;
const PACKAGE_MANAGER_COMMANDS = new Set(["add", "audit", "bin", "cache", "config", "create", "dedupe", "deploy", "dlx", "doctor", "env", "exec", "fetch", "i", "import", "info", "init", "install", "licenses", "link", "list", "ls", "outdated", "pack", "patch", "prune", "publish", "rebuild", "remove", "rm", "root", "run", "self-update", "server", "setup", "store", "un", "uninstall", "unlink", "up", "update", "upgrade", "why", "workspace", "workspaces"]);

/** A negation among the three words before the verb of making, in its clause. */
const NEGATED = /(?:\b(?:not|never|no)\b|n't\b)(?:\s+\S+){0,2}\s*$/i;

/** Whether the sentence makes the backticked token at each place it names it. */
export function makes(sentence: string, token: string): boolean {
  const quoted = `\`${token}\``;
  const at: number[] = [];
  for (let i = sentence.indexOf(quoted); i >= 0; i = sentence.indexOf(quoted, i + 1)) at.push(i);
  return (
    at.length > 0 &&
    at.every((i) => {
      const before = sentence.slice(0, i).replace(/`[^`]*`/g, "x");
      const verb = MAKES.exec(before);
      // The negation must stand in the verb's own clause: "If it is not there, create `x`" makes it.
      return verb !== null && !NEGATED.test(before.slice(0, verb.index).replace(/^.*[,;:]/, ""));
    })
  );
}

/**
 * An inline link or image, `[text](target "title")`, its target holding balanced parentheses one deep, and a link
 * reference definition, `[label]: target`.
 */
const LINK = /!?\[(?:[^\]\\]|\\.)*\]\(\s*((?:[^()\s]|\([^()\s]*\))+)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/g;
const REFERENCE = /^\s{0,3}\[[^\]]+\]:\s*(\S+)/;
/** An inline code span, opened and closed by the same run of backticks. */
const CODE_SPAN = /(`+)[\s\S]*?(?<!`)\1(?!`)/g;

/** The links of a line outside inline code: each target, and the link as written, by which its sentence is found. */
export function linkTargets(line: string): { target: string; written: string }[] {
  const text = line.replace(CODE_SPAN, (m) => " ".repeat(m.length));
  const ref = REFERENCE.exec(text);
  return [...[...text.matchAll(LINK)].map((m) => ({ target: m[1]!, written: m[0] })), ...(ref !== null ? [{ target: ref[1]!, written: ref[0].trim() }] : [])];
}

/** A host written without its scheme, such as `npmjs.com` or `www.example.org/x.js`, is not a path. */
const HOST = /^(?:www\.|[\w-]+(?:\.[\w-]+)*\.(?:com|org|net|io|dev|co|ai|app|edu|gov)$)/i;

/**
 * The repository path a link target names, from the directory of the document `from` (From the TypeScript run,
 * section 3): a relative target whose last segment has an extension other than .html, with its fragment, query and
 * escapes read. A target with a scheme, one from the root or a fragment alone, one with no extension (a page of a
 * site) and one that leaves the repository name none.
 */
export function linkPath(target: string, from: string): string | undefined {
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(target) || /^[/#<]/.test(target)) return undefined;
  let path = target.replace(/[#?].*$/, "");
  try {
    path = decodeURIComponent(path);
  } catch {
    return undefined;
  }
  const last = path.slice(path.lastIndexOf("/") + 1);
  if (!/\.[A-Za-z0-9]+$/.test(last) || /\.html?$/i.test(last) || HOST.test(path.split("/")[0]!)) return undefined;
  const joined = posix.normalize(posix.join(posix.dirname(from), path));
  return joined === ".." || joined.startsWith("../") ? undefined : joined;
}

/**
 * An `owner/repo` token: exactly two segments, the last with no file extension, and one of them holding a digit, `-`,
 * `_` or `.` as repository names do, so words such as and/or or client/server are not read as one.
 */
const REPO = /(?<![\w./@:-])([A-Za-z0-9][\w.-]*\/[A-Za-z0-9][\w-]*)(?![\w/.-])/g;
const REPO_NAME = /[\d_.-]/;
/** Media types are written as two segments too, and never name a repository. */
const MEDIA = /^(?:application|text|image|audio|video|multipart|font|message|model)\//;

/** The `owner/repo` tokens of a sentence, backticked or not, that are not media types. */
export function repoTokens(sentence: string): string[] {
  return [...new Set([...sentence.replace(/`/g, " ").matchAll(REPO)].map((m) => m[1]!).filter((t) => !MEDIA.test(t) && REPO_NAME.test(t)))];
}

/**
 * The paragraph each prose line of a Markdown file sits in: its lines joined by a space, and where in that text the line
 * starts, so a sentence that runs over a line break is read whole. Fences, headings, tables and blank lines end one,
 * and each list item starts one.
 */
function paragraphsOf(lines: string[]): Map<number, { text: string; start: number; length: number }> {
  const out = new Map<number, { text: string; start: number; length: number }>();
  let group: { i: number; line: string }[] = [];
  let fence = false;
  const flush = () => {
    const text = group.map((g) => g.line).join(" ");
    let at = 0;
    for (const g of group) {
      out.set(g.i, { text, start: at, length: g.line.length });
      at += g.line.length + 1;
    }
    group = [];
  };
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (/^(`{3,}|~{3,})/.test(line)) {
      flush();
      fence = !fence;
      return;
    }
    if (fence || line === "" || line.startsWith("#") || line.startsWith("|")) {
      flush();
      return;
    }
    if (/^(?:[-*+]|\d+[.)])\s/.test(line)) flush();
    group.push({ i, line });
  });
  flush();
  return out;
}

/**
 * Whether a document's prose, outside fences and headings, says its scenarios are not executed (section 7): one of its
 * sentences says "not executed", "specification prose" or "are not run" and names a scenario.
 */
function saysNotExecuted(lines: string[]): boolean {
  const said = /\b(?:not executed|specification prose|(?:are|is) not run)\b/i;
  return [...new Set([...paragraphsOf(lines).values()].map((p) => p.text))].some((text) => sentencesOf(text).some((x) => said.test(x.text) && /\bscenarios?\b/i.test(x.text)));
}

/**
 * Whether a text file is a baseline (section 6): one of the comment lines before its first entry says the file may only
 * shrink. A header comment may wrap, so its lines are read together.
 */
export function isBaseline(text: string): boolean {
  const header: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "") continue;
    if (!line.startsWith("#")) break;
    header.push(line.replace(/^#+\s*/, ""));
  }
  return /\bmay\s+only\s+shrink\b/i.test(header.join(" "));
}

/** The names of the checks a dependency-cruiser configuration defines: each `name: "…"` of its text, never run. */
export function cruiserChecks(text: string): string[] {
  return [...new Set([...text.matchAll(/["']?\bname["']?\s*:\s*(["'`])([^"'`\n]+)\1/g)].map((m) => m[2]!))];
}

/** A list item's text states an obligation: it says shall or must. */
export const OBLIGES = /\b(?:shall|must)\b/i;

export function run(input: AdapterInput): AdapterOutput {
  const idPattern = idPatternOf(input);
  const headingId = new RegExp(`^(?<id>(?:${idPattern}))(?=$|[\\s·:—–-])\\s*[·:—–-]?\\s*(?<rest>.*)$`);
  const anyId = new RegExp(`\\b(?:${idPattern})\\b`, "g");
  const fieldNames = (input.config?.headingFields ?? "").split(",").map((s) => key(s)).filter((s) => s !== "");
  const verifiedField = key(input.config?.verifiedField ?? "Verified by");
  // "references": a heading that opens with an identifier is a section about an item another source defines, read as
  // an implements edge from the document rather than as an item of its own.
  const headingsAreItems = input.config?.headings !== "references";
  const lift = input.config?.told === "sentences";
  // A table row whose first cell is an identifier defines a requirement: `| ING-001 | Event | When ..., the system shall ... |`.
  // The sentence is the first cell that says shall (a pattern or status column often sits between), else the first cell.
  const tableId = new RegExp(`^\\|\\s*(${idPattern})\\s*\\|`);
  // A list item that opens with an identifier, bold or not, and states what shall or must hold defines a requirement too:
  // `- **LED-1** The ledger shall reject a negative amount.` (The analysis A3 and 1.0, stage 77; A-276). An item that
  // only names an identifier ("- LED-1 is covered by ...") states no obligation and is a mention.
  const listId = new RegExp(`^[-*+]\\s+(?:\\*\\*)?(${idPattern})(?:\\*\\*)?\\s*[·:—–-]?\\s*(?:\\*\\*)?\\s*(.+)$`);
  const tableCells = (row: string): string[] => row.replace(/^\|/, "").replace(/\|\s*$/, "").split("|").map((c) => plain(c));
  const items: SourceItem[] = [];
  const edges: ItemEdge[] = [];
  const diagnostics: Diagnostic[] = [];
  const seen = new Map<string, string>();
  const add = (it: SourceItem): boolean => {
    const prior = seen.get(it.id);
    if (prior !== undefined) {
      diagnostics.push({ code: "duplicate-id", severity: "error", message: `${it.id} is defined at ${prior} and again here`, span: it.span });
      return false;
    }
    seen.set(it.id, it.span);
    items.push(it);
    return true;
  };
  // Tokens the profile says are examples, never paths (From real runs, stage 43): `placeholders` is one pattern a whole
  // token must match, such as `src/x\\.ts|<[^>]+>`.
  const placeholder = input.config?.placeholders !== undefined ? new RegExp(`^(?:${input.config.placeholders})$`) : undefined;
  const pathOf = (t: string) => (placeholder?.test(t.trim()) === true ? undefined : (pathToken(t) ?? bareFileToken(t)));
  // The checks the source's dependency-cruiser configurations define, by name, and the file that defines each.
  const checks = new Map<string, string>();
  for (const file of sortedFiles(input)) if (DEPENDENCY_CRUISER.test(file.path)) for (const n of cruiserChecks(decode(file.bytes))) if (!checks.has(n)) checks.set(n, file.path);
  // The import-linter contracts each configuration file holds (From the Toads run, section 4).
  const contracts = new Map<string, Contract[]>();
  for (const file of sortedFiles(input)) {
    if (!IMPORT_LINTER.test(file.path)) continue;
    const cs = importContracts(file.path, decode(file.bytes));
    if (cs.length > 0) contracts.set(file.path, cs);
  }
  for (const file of sortedFiles(input)) {
    // A baseline (section 6): a text file that says it may only shrink, its other lines the gaps it records.
    if (/\.txt$/i.test(file.path)) {
      const text = decode(file.bytes);
      if (!isBaseline(text)) continue;
      const entries = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== "" && !l.startsWith("#"));
      add({ id: file.path, kind: "baseline", text: file.path, span: `${file.path}:1`, textDigest: digestOf(text), attrs: { entries: String(entries.length), first: entries.slice(0, 5).join("\n") } });
      continue;
    }
    if (!/\.(md|markdown)$/i.test(file.path)) continue;
    const text = decode(file.bytes);
    const lines = text.split(/\r?\n/);
    const doc: SourceItem = { id: file.path, kind: "document", text: file.path, span: `${file.path}:1`, textDigest: digestOf(text) };
    // The package a document below the root describes, its directory; a change log describes the past (stage 67).
    const packageDir = file.path.includes("/") && !CHANGE_LOG.test(posix.basename(file.path)) ? posix.dirname(file.path) : undefined;
    add(doc);
    let open: Open | undefined;
    // The open fence's character and length: only a fence of the same character, at least as long, closes it.
    let fence: { char: string; length: number; gherkin: boolean } | undefined;
    const prose = new Set<string>();
    const specifies = saysNotExecuted(lines);
    // The Verified by field being read: its mechanisms are the first sentence of the whole value, which may run on to
    // indented lines, so its edges are made once the field ends.
    let verifying: { item: SourceItem; value: string; tokens: { t: string; span: string }[] } | undefined;
    const endField = () => {
      if (verifying === undefined) return;
      const first = firstSentence(verifying.value);
      const mechanisms = new Set(backticked(first));
      // A mechanism sentence that says a file it names is retired or deleted names no mechanism in it (A-279).
      const gone = ABSENT.test(first.replace(/`[^`]*`/g, " "));
      const made = new Set<string>();
      for (const { t, span } of verifying.tokens) {
        if (mechanisms.has(t) && !made.has(t)) {
          made.add(t);
          const p = pathOf(t);
          edges.push({ from: verifying.item.id, rel: "verified-by", to: p !== undefined ? `file:${p}` : `text:${t}`, span, ...(gone && p !== undefined ? { absent: true } : {}) });
        } else if (!mechanisms.has(t)) {
          const p = pathOf(t);
          if (p !== undefined) edges.push({ from: verifying.item.id, rel: "mentions-file", to: `file:${p}`, span });
        }
      }
      verifying = undefined;
    };
    // Whether every sentence naming the backticked token says it is gone, or not there yet (stages 67 and 68).
    const gone = (text: string, span: string, t: string) => {
      const own = sentencesAt(text, span).filter((x) => x.text.includes(`\`${t}\``));
      return own.length > 0 && own.every((x) => ABSENT.test(x.text.replace(/`[^`]*`/g, " ")) || PLANNED.test(x.text.replace(/`[^`]*`/g, " ")));
    };
    // A symbol beside a code path ("`buildError` in `src/core/util/error.ts`") says the file declares it, and `npm run x`
    // says the script exists (stage 24). Only these two shapes are read: a symbol elsewhere on the line is not.
    const codeMentions = (text: string, from: string, span: string) => {
      const sym = "([A-Za-z_$][\\w$]*)(?:\\(\\))?";
      // A name read beside its file is not read again as a name of the package.
      const beside = new Set<string>();
      for (const m of text.matchAll(new RegExp(`\`${sym}\`\\s+(?:in|from|of|exported by|declared in)\\s+\`([^\`]+)\``, "g"))) {
        const p = pathToken(m[2]!);
        if (p === undefined || !CODE_FILE.test(p)) continue;
        edges.push({ from, rel: "mentions-symbol", to: `symbol:${p}#${m[1]}`, span });
        beside.add(m[1]!);
      }
      for (const m of text.matchAll(new RegExp(`\`([^\`]+)\`\\s+(?:exports|declares|defines)\\s+\`${sym}\``, "g"))) {
        const p = pathToken(m[1]!);
        if (p === undefined || !CODE_FILE.test(p)) continue;
        edges.push({ from, rel: "mentions-symbol", to: `symbol:${p}#${m[2]}`, span });
        beside.add(m[2]!);
      }
      for (const t of backticked(text)) {
        // The name ends the token or a word: `npm run test:<name>` is a pattern of names, not a script.
        const s = /^(?:npm|pnpm|yarn) run ([\w:.\-]+)(?=$|\s)/.exec(t);
        if (s !== null) edges.push({ from, rel: "mentions-script", to: `script:${s[1]}`, span });
        // The short form may name a script of a workspace package, so it is checked only when it resolves: never dangling.
        const short = s === null ? SHORT_SCRIPT.exec(t) : null;
        if (short !== null && !PACKAGE_MANAGER_COMMANDS.has(short[1]!)) edges.push({ from, rel: "mentions-script", to: `script:${short[1]}`, span, absent: true });
        // A task runner's command names its task (stage 68): `npx hereby test`, `make lint`, `just fmt`.
        const task = TASK_COMMAND.exec(t);
        if (task !== null) edges.push({ from, rel: "mentions-script", to: `task:${task[1]}#${task[2]}`, span, ...(gone(text, span, t) ? { absent: true } : {}) });
      }
      // A name of the package's code that its own document gives in backticks (stage 67).
      if (packageDir !== undefined) {
        const named = new Set<string>();
        for (const t of backticked(text)) {
          const m = CODE_NAME.exec(t.trim());
          if (m === null || named.has(m[1]!) || beside.has(m[1]!)) continue;
          named.add(m[1]!);
          edges.push({ from, rel: "mentions-symbol", to: `symbol:${packageDir}/#${m[1]}`, span, ...(gone(text, span, t) ? { absent: true } : {}) });
        }
      }
    };
    // Each path is read with its sentence (section 5), which may run over several lines of its paragraph: one that says
    // the file is absent, or names another repository.
    const paragraphs = paragraphsOf(lines);
    // The sentences of the line at `span`, read whole over the line breaks of its paragraph.
    const sentencesAt = (text: string, span: string) => {
      const line = Number(span.slice(span.lastIndexOf(":") + 1)) - 1;
      const para = paragraphs.get(line);
      return para === undefined ? sentencesOf(text) : sentencesOf(para.text).filter((x) => x.offset < para.start + para.length && x.offset + x.text.length > para.start);
    };
    const mentions = (text: string, from: string, span: string) => {
      const sentences = sentencesAt(text, span);
      const seen = new Set<string>();
      const paths = new Set<string>();
      const mention = (p: string, own: { text: string }[], made: (sentence: string) => boolean, exact = false) => {
        paths.add(p);
        // Every sentence on the line that mentions the path must say so: one that only uses it is a claim.
        const absent = own.length > 0 && own.every((x) => ABSENT.test(x.text.replace(/`[^`]*`/g, " ")) || made(x.text));
        const named = own.map((x) => repoTokens(x.text).filter((r) => r !== p.replace(/\/$/, "")));
        const others = named.length > 0 && named.every((n) => n.length > 0) ? [...new Set(named.flat())] : [];
        edges.push({ from, rel: "mentions-file", to: `file:${p}`, span, ...(absent ? { absent: true } : {}), ...(others.length > 0 ? { repos: others } : {}), ...(exact ? { exact: true } : {}) });
      };
      for (const t of backticked(text)) {
        const p = pathOf(t);
        if (p === undefined || seen.has(t)) continue;
        seen.add(t);
        mention(p, sentences.filter((x) => x.text.includes(`\`${t}\``)), (s) => makes(s, t));
      }
      links(text, from, span, sentences, paths, mention);
    };
    // A relative link names a file from the document's directory (From the TypeScript run, section 3), by its exact path,
    // so a link from a root-level document is not read as a bare name. A link in a Verified by field is read too.
    const links = (text: string, from: string, span: string, sentences = sentencesAt(text, span), paths = new Set<string>(), mention?: (p: string, own: { text: string }[], made: (sentence: string) => boolean, exact?: boolean) => void) => {
      const doc = span.slice(0, span.lastIndexOf(":"));
      for (const { target, written } of linkTargets(text)) {
        const p = linkPath(target, doc);
        if (p === undefined || paths.has(p)) continue;
        paths.add(p);
        const own = sentences.filter((x) => x.text.includes(written));
        const found = own.length > 0 ? own : sentences.filter((x) => x.text.includes(target));
        if (mention !== undefined) mention(p, found, () => false, true);
        else {
          const absent = found.length > 0 && found.every((x) => ABSENT.test(x.text.replace(/`[^`]*`/g, " ")));
          edges.push({ from, rel: "mentions-file", to: `file:${p}`, span, exact: true, ...(absent ? { absent: true } : {}) });
        }
      }
    };
    const close = () => {
      endField();
      if (open === undefined) return;
      const body = plain(open.paragraph.join(" "));
      if (body !== "") {
        open.item.text = body;
        open.item.textDigest = digestOf(body);
      }
      const pattern = classify(open.item.text);
      if (pattern !== undefined) open.item.pattern = pattern;
      open = undefined;
    };
    const fromId = () => open?.item.id ?? doc.id;
    lines.forEach((raw, i) => {
      const span = `${file.path}:${i + 1}`;
      const fenceMark = /^\s*(`{3,}|~{3,})(.*)$/.exec(raw);
      if (fenceMark !== null) {
        const mark = fenceMark[1]!;
        if (fence === undefined) {
          endField();
          fence = { char: mark[0]!, length: mark.length, gherkin: /^(?:gherkin|feature)$/i.test(fenceMark[2]!.trim()) };
        } else if (mark[0] === fence.char && mark.length >= fence.length && fenceMark[2]!.trim() === "") fence = undefined;
        return;
      }
      // Specification prose in Gherkin (section 7): each scenario of a gherkin fence is a requirement of its own, in a
      // document whose prose says its scenarios are not executed; elsewhere a fence is an example of the form.
      if (fence?.gherkin === true && lift && specifies) {
        const sc = /^\s*(?:Scenario Outline|Scenario Template|Scenario|Example):\s*(.+?)\s*$/.exec(raw);
        if (sc !== null) {
          const title = sc[1]!;
          add({ id: unique(`${file.path}#${slug(title)}`, prose), kind: "requirement", text: title, span, textDigest: digestOf(title), attrs: { gherkin: "prose" } });
        }
      }
      if (fence !== undefined) return;
      const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(raw);
      if (h !== null) {
        const level = h[1]!.length;
        if (open !== undefined && level <= open.level) close();
        else if (open !== undefined) open.textDone = true;
        endField();
        const m = headingId.exec(h[2]!);
        if (m !== null && !headingsAreItems) {
          close();
          edges.push({ from: doc.id, rel: "implements", to: m.groups!.id!, span });
        } else if (m !== null) {
          close();
          const parts = m.groups!.rest!.split("·").map((s) => plain(s)).filter((s) => s !== "");
          const attrs: Record<string, string> = {};
          parts.forEach((p, n) => (attrs[fieldNames[n] ?? `heading-${n + 1}`] = p));
          const heading = plain(h[2]!);
          const item: SourceItem = { id: m.groups!.id!, kind: "requirement", text: heading, span, textDigest: digestOf(heading) };
          if (parts.length > 0) item.attrs = attrs;
          if (add(item)) open = { item, level, paragraph: [], textDone: false };
        }
        mentions(h[2]!, fromId(), span);
        codeMentions(h[2]!, fromId(), span);
        return;
      }
      const row = headingsAreItems ? tableId.exec(raw.trim()) : null;
      if (row !== null) {
        endField();
        close();
        const cells = tableCells(raw.trim()).slice(1);
        const text = cells.find((c) => /\bshall\b/i.test(c)) ?? cells[0] ?? "";
        const item: SourceItem = { id: row[1]!, kind: "requirement", text, span, textDigest: digestOf(text) };
        const pattern = classify(text);
        if (pattern !== undefined) item.pattern = pattern;
        add(item);
        mentions(raw, row[1]!, span);
        codeMentions(raw, row[1]!, span);
        return;
      }
      const listed = headingsAreItems && open === undefined ? listId.exec(raw.trim()) : null;
      // An identifier already defined, by a heading, a row or an earlier item, is mentioned here, not defined again.
      if (listed !== null && OBLIGES.test(listed[2]!) && !seen.has(listed[1]!)) {
        endField();
        const text = plain(listed[2]!);
        const item: SourceItem = { id: listed[1]!, kind: "requirement", text, span, textDigest: digestOf(text) };
        const pattern = classify(text);
        if (pattern !== undefined) item.pattern = pattern;
        add(item);
        mentions(raw, listed[1]!, span);
        codeMentions(raw, listed[1]!, span);
        return;
      }
      const line = raw.trim();
      // An Implements line names the requirements the document serves.
      const impl = /^\*\*Implements:?\*\*:?\s*(.*)$/.exec(line);
      if (impl !== null) {
        endField();
        for (const id of new Set([...impl[1]!.matchAll(anyId)].map((x) => x[0]))) edges.push({ from: doc.id, rel: "implements", to: id, span });
        return;
      }
      if (open !== undefined) {
        const bullet = /^[-*+]\s+\*\*([^*]+?):?\*\*:?\s*(.*)$/.exec(line);
        if (bullet !== null) {
          endField();
          open.textDone = true;
          const name = key(bullet[1]!);
          open.field = name;
          open.item.attrs = { ...(open.item.attrs ?? {}), [name]: bullet[2]! };
          if (name === verifiedField) verifying = { item: open.item, value: bullet[2]!, tokens: [] };
        } else if (line === "") {
          endField();
          if (open.paragraph.length > 0) open.textDone = true;
          delete open.field;
        } else if (open.field !== undefined && /^\s/.test(raw)) {
          open.item.attrs![open.field] = `${open.item.attrs![open.field]} ${line}`;
          if (verifying !== undefined) verifying.value = `${verifying.value} ${line}`;
        } else {
          endField();
          if (!open.textDone) open.paragraph.push(line);
        }
      }
      if (verifying !== undefined) {
        for (const t of backticked(line)) verifying.tokens.push({ t, span });
        links(line, verifying.item.id, span);
      } else mentions(line, fromId(), span);
      codeMentions(line, verifying?.item.id ?? fromId(), span);
    });
    close();
    // Told rules (stage 55): with `told: sentences`, each layering or EARS sentence outside an identified item is an
    // item of its own, at its line, cited as the sentence.
    if (lift) {
      const taken = new Set<string>();
      const opens = (heading: string) => headingsAreItems && headingId.test(heading);
      for (const s of toldSentences(lines, opens)) {
        const id = unique(`${file.path}#L${s.line}`, taken);
        const item: SourceItem = { id, kind: "requirement", text: s.text, span: `${file.path}:${s.line}`, textDigest: digestOf(s.text), attrs: { lifted: s.told, sentence: s.text } };
        const pattern = classify(s.text);
        if (pattern !== undefined) item.pattern = pattern;
        // A sentence that says something checks it claims a rung (stage 56); the ladder says whether one stands behind it.
        const claim = claimOf(s.text);
        if (claim !== undefined) item.attrs!.claims = claim;
        add(item);
        // A told rule that names a check its repository's dependency-cruiser configuration defines is verified by it.
        const named = [...new Set(backticked(s.text).filter((t) => checks.has(t)))];
        for (const n of named) edges.push({ from: id, rel: "verified-by", to: `file:${checks.get(n)!}`, span: item.span });
        // So is one that names an import-linter contract, by its name, its modules, or the file that holds it (A-218).
        // A quotation names nothing, as it states nothing (A-219).
        const said = unquoted(s.text);
        for (const [config, cs] of contracts) if (namesContract(said, backticked(said), config, cs)) edges.push({ from: id, rel: "verified-by", to: `file:${config}`, span: item.span });
      }
    }
  }
  return { items, edges, diagnostics };
}

export const adapter: Adapter = { manifest: { ...manifest, produces: [...manifest.produces], inputKinds: [...manifest.inputKinds] }, run };
