// Results from runners other than Jest and Vitest (stage 30): JUnit XML, which pytest, Maven Surefire, Gradle and
// cargo-nextest write, and the event lines of `go test -json`. Both are language-neutral formats: this file reads what
// a report says of each test (its file as the runner names it, its full name and its outcome) and knows no language's
// layout beyond pytest's dotted module names. A test it cannot place is reported as written, never guessed at, and the
// tests adapter counts it as unmatched. Malformed input is a problem with its line, never a silently partial result.
import type { RunnerResult, TestOutcome, WitnessProblem } from "./witness.ts";
import { parseXml, type XmlElement } from "./xml.ts";

type Parsed = { results: RunnerResult[]; problems: WitnessProblem[] };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** True when the document's root element, after any declaration, comments and doctype, is `testsuites` or `testsuite`. */
export function isJUnitXml(text: string): boolean {
  return /^(?:\s|<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>[]*(?:\[[\s\S]*?\])?\s*>)*<testsuites?[\s/>]/.test(text.replace(/^\uFEFF/, ""));
}

/**
 * True when the first line that opens an object is a `go test -json` event: an object with string `Action` and
 * `Package`. Lines before it that are not JSON (`go: downloading ...`, written to the same stream) are the report's
 * problems, not a reason to read it as something else (F124).
 */
export function isGoTestJson(text: string): boolean {
  const first = text.split(/\r?\n/).find((l) => l.trimStart().startsWith("{"));
  if (first === undefined || !first.includes('"Action"')) return false;
  try {
    const v: unknown = JSON.parse(first);
    return isRecord(v) && typeof v.Action === "string" && typeof v.Package === "string";
  } catch {
    return false;
  }
}

/** A pytest module name in a classname: `tests.unit.test_a.TestB` is in `tests/unit/test_a.py`. */
const PYTEST_MODULE = /^test_|_test$/;

/**
 * The file a JUnit test case ran in: its own `file` attribute or its suite's (pytest's xunit1 family writes one), else,
 * for pytest, its classname up to the last segment named like a test module, as a path. Otherwise the classname as
 * written: a Java or Rust classname names a class or a crate, not a file, and its file cannot be told from it.
 */
function junitFile(tc: XmlElement, suiteFile: string | undefined, pytest: boolean): string {
  const file = tc.attributes.file ?? suiteFile;
  if (file !== undefined && file !== "") return file;
  const classname = tc.attributes.classname ?? "";
  const segments = classname.split(".");
  if (pytest || segments[segments.length - 1]!.startsWith("test_")) {
    let last = -1;
    segments.forEach((s, k) => {
      if (PYTEST_MODULE.test(s)) last = k;
    });
    if (last >= 0) return `${segments.slice(0, last + 1).join("/")}.py`;
  }
  return classname;
}

function junitOutcome(tc: XmlElement): TestOutcome {
  const has = (n: string) => tc.children.some((c) => c.name === n);
  // A failure says the test ran and failed, which is more than an error says; a test with neither that was skipped is skipped.
  if (has("failure")) return "failed";
  if (has("error")) return "errored";
  if (has("skipped")) return "skipped";
  return "passed";
}

/**
 * Each `<testcase>` of a JUnit XML report, in document order, through any nesting of `<testsuite>`s. Its name is its
 * classname and name joined by a space, so an identifier in either is cited; `at` is the line of the test case.
 */
export function parseJUnit(text: string): Parsed {
  const { root, problems } = parseXml(text.replace(/^\uFEFF/, ""));
  if (root === undefined) return { results: [], problems };
  const results: RunnerResult[] = [];
  const out: WitnessProblem[] = [];
  const visit = (el: XmlElement, suiteFile: string | undefined, pytest: boolean) => {
    for (const c of el.children) {
      if (c.name === "testsuite" || c.name === "testsuites") {
        visit(c, c.attributes.file ?? suiteFile, pytest || c.attributes.name === "pytest");
      } else if (c.name === "testcase") {
        const name = c.attributes.name;
        if (name === undefined) {
          out.push({ line: c.line, message: "a testcase has no name" });
          continue;
        }
        const classname = c.attributes.classname ?? "";
        results.push({ file: junitFile(c, suiteFile, pytest), name: classname === "" ? name : `${classname} ${name}`, outcome: junitOutcome(c), at: String(c.line) });
      }
    }
  };
  if (root.name !== "testsuites" && root.name !== "testsuite") out.push({ line: root.line, message: "a JUnit report's root is testsuites or testsuite" });
  else visit({ ...root, children: [root] }, undefined, false);
  return { results, problems: out };
}

const GO_ACTIONS: Record<string, TestOutcome> = { pass: "passed", fail: "failed", skip: "skipped" };

/**
 * The events of `go test -json`. Each `pass`, `fail` or `skip` of a test is a result for its package's import path,
 * subtests by their full name (`TestA/case_1`); output and other events are read past. A package that failed with no
 * test failing in it (a build failure, an exit from TestMain) is one errored result with an empty name. Lines that are not
 * JSON objects are problems.
 */
export function parseGoTestJson(text: string): Parsed {
  const results: RunnerResult[] = [];
  const problems: WitnessProblem[] = [];
  const failed = new Map<string, number>();
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    if (raw.trim() === "") return;
    let v: unknown;
    try {
      v = JSON.parse(raw);
    } catch (err) {
      problems.push({ line, message: `not JSON: ${(err as Error).message}` });
      return;
    }
    if (!isRecord(v) || typeof v.Action !== "string") {
      problems.push({ line, message: "not a go test -json event with an Action" });
      return;
    }
    // Build events (go 1.24) name an ImportPath, not a Package; the package's own fail event follows them.
    if (typeof v.Package !== "string") return;
    const pkg = v.Package;
    const outcome = GO_ACTIONS[v.Action];
    if (outcome === undefined) return;
    if (typeof v.Test === "string" && v.Test !== "") {
      results.push({ file: pkg, name: v.Test, outcome, at: String(line) });
      if (outcome === "failed") failed.set(pkg, (failed.get(pkg) ?? 0) + 1);
    } else if (outcome === "failed" && !failed.has(pkg)) {
      results.push({ file: pkg, name: "", outcome: "errored", at: String(line) });
    }
  });
  return { results, problems };
}
