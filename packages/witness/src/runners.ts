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

/** True when the report is cucumber-js JSON: an array whose first entry is a feature with a `uri` and `elements` (stage 42). */
export function isCucumberJson(text: string): boolean {
  const t = text.replace(/^﻿/, "").trimStart();
  if (!t.startsWith("[")) return false;
  try {
    const v: unknown = JSON.parse(t);
    return Array.isArray(v) && (v.length === 0 ? false : isRecord(v[0]) && typeof v[0].uri === "string" && Array.isArray(v[0].elements));
  } catch {
    return false;
  }
}

/**
 * The scenarios of a cucumber-js JSON report (stage 42), each one result in its feature's file. Its name is the
 * feature's name, the scenario's name and its tags, so a tag cites. A failed step fails it; an ambiguous step makes it
 * errored; a skipped, pending or undefined step, with none failed, skips it. A background is not a result.
 */
export function parseCucumberJson(text: string): Parsed {
  const results: RunnerResult[] = [];
  const problems: WitnessProblem[] = [];
  let v: unknown;
  try {
    v = JSON.parse(text.replace(/^﻿/, ""));
  } catch (err) {
    return { results, problems: [{ line: 1, message: `not JSON: ${(err as Error).message}` }] };
  }
  (v as unknown[]).forEach((f, i) => {
    if (!isRecord(f) || typeof f.uri !== "string" || !Array.isArray(f.elements)) {
      problems.push({ line: 1, message: `[${i}] is not a feature with a uri and elements` });
      return;
    }
    const feature = typeof f.name === "string" ? f.name : "";
    f.elements.forEach((e: unknown, j) => {
      const at = `[${i}].elements[${j}]`;
      if (!isRecord(e)) {
        problems.push({ line: 1, message: `${at} is not a scenario` });
        return;
      }
      if (e.type === "background" || e.keyword === "Background") return;
      const statuses = (Array.isArray(e.steps) ? e.steps : []).map((s: unknown) => (isRecord(s) && isRecord(s.result) && typeof s.result.status === "string" ? s.result.status : "undefined"));
      const outcome: TestOutcome = statuses.includes("failed") ? "failed" : statuses.includes("ambiguous") ? "errored" : statuses.some((s) => s === "skipped" || s === "pending" || s === "undefined") ? "skipped" : "passed";
      const tags = (Array.isArray(e.tags) ? e.tags : []).flatMap((t: unknown) => (isRecord(t) && typeof t.name === "string" ? [t.name] : []));
      const name = [feature, typeof e.name === "string" ? e.name : "", ...tags].filter((x) => x !== "").join(" ");
      results.push({ file: f.uri as string, name, outcome, at });
    });
  });
  return { results, problems };
}

/** True when the report is Playwright JSON: an object with a `suites` array and a `config` (stage 42). */
export function isPlaywrightJson(text: string): boolean {
  const t = text.replace(/^﻿/, "").trimStart();
  return t.startsWith("{") && /"suites"\s*:/.test(t) && /"config"\s*:/.test(t) && !/"testResults"\s*:/.test(t);
}

const PLAYWRIGHT_STATUS: Record<string, TestOutcome> = { expected: "passed", flaky: "passed", unexpected: "failed", skipped: "skipped" };

/**
 * The tests of a Playwright JSON report (stage 42), each one result in its spec's file, read from the directory the
 * report names as `config.rootDir`. Its name is the titles of the suites around it, the spec's title and its tags,
 * each tag with an `@` and, when that differs, upper-cased too, as the tests adapter reads a tag option.
 */
export function parsePlaywrightJson(text: string): Parsed {
  const results: RunnerResult[] = [];
  const problems: WitnessProblem[] = [];
  let v: unknown;
  try {
    v = JSON.parse(text.replace(/^﻿/, ""));
  } catch (err) {
    return { results, problems: [{ line: 1, message: `not JSON: ${(err as Error).message}` }] };
  }
  if (!isRecord(v) || !Array.isArray(v.suites)) return { results, problems: [{ line: 1, message: "a Playwright report needs a suites array" }] };
  const root = isRecord(v.config) && typeof v.config.rootDir === "string" ? v.config.rootDir.replace(/\\/g, "/").replace(/\/+$/, "") : "";
  const fileOf = (file: string) => (root === "" || /^(?:\/|[A-Za-z]:)/.test(file) ? file : `${root}/${file}`);
  const visit = (suite: unknown, titles: string[], at: string, top: boolean) => {
    if (!isRecord(suite)) {
      problems.push({ line: 1, message: `${at} is not a suite` });
      return;
    }
    // A file's own suite is titled by its path, which is not part of a test's name.
    const own = !top && typeof suite.title === "string" && suite.title !== "" ? [...titles, suite.title] : titles;
    (Array.isArray(suite.specs) ? suite.specs : []).forEach((spec: unknown, i) => {
      const sat = `${at}.specs[${i}]`;
      if (!isRecord(spec) || typeof spec.file !== "string" || typeof spec.title !== "string") {
        problems.push({ line: 1, message: `${sat} names no file and title` });
        return;
      }
      const tags = (Array.isArray(spec.tags) ? spec.tags : []).flatMap((t: unknown) => {
        if (typeof t !== "string") return [];
        const tag = t.startsWith("@") ? t : `@${t}`;
        return tag.toUpperCase() === tag ? [tag] : [tag, tag.toUpperCase()];
      });
      (Array.isArray(spec.tests) ? spec.tests : []).forEach((t: unknown, j) => {
        const outcome = isRecord(t) && typeof t.status === "string" ? PLAYWRIGHT_STATUS[t.status] : undefined;
        if (outcome === undefined) {
          problems.push({ line: 1, message: `${sat}.tests[${j}] has no status Playwright reports` });
          return;
        }
        results.push({ file: fileOf(spec.file as string), name: [...own, spec.title as string, ...tags].join(" "), outcome, at: `${sat}.tests[${j}]` });
      });
    });
    (Array.isArray(suite.suites) ? suite.suites : []).forEach((s: unknown, k) => visit(s, own, `${at}.suites[${k}]`, false));
  };
  v.suites.forEach((s: unknown, k) => visit(s, [], `suites[${k}]`, true));
  return { results, problems };
}
