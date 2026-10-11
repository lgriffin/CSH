// Test results (Ingesting a codebase, stage 26): what a test runner said of each test, counted per test file and per
// item a test cites. A test cites what its full name names, resolved as its file's citation of that identifier is,
// else as any edge to it is, else to the one item with that identifier. The counts are reported beside the verdicts and never enter one (P2); a test file with a
// test that failed or could not run is a failing-test gap, a suggestion to look at, not a refutation.
import { compareCodePoints } from "@csh/kernel";
import type { Prepared } from "./pool.ts";
import type { Gap, Report } from "./types.ts";

type Outcomes = NonNullable<Report["outcomes"]>[number];

export function testOutcomes(prepared: Prepared, edges: NonNullable<Report["edges"]>): { outcomes: Outcomes[]; gaps: Gap[] } {
  if (prepared.results.length === 0) return { outcomes: [], gaps: [] };
  // The item a cited identifier is: as the test file's own edge resolved it, else as any edge to it did.
  const own = new Map<string, string>();
  const any = new Map<string, string>();
  for (const e of edges) {
    if (e.target === undefined) continue;
    if (e.rel === "cites") own.set(`${e.source}\u0000${e.from}\u0000${e.to}`, e.target);
    if (!any.has(e.to) || compareCodePoints(e.target, any.get(e.to)!) < 0) any.set(e.to, e.target);
  }
  const byId = new Map<string, string[]>();
  for (const i of prepared.items) if (i.kind !== "test-file") byId.set(i.id, [...(byId.get(i.id) ?? []), `${i.source}/${i.id}`]);
  const only = (id: string) => {
    const found = byId.get(id);
    return found?.length === 1 ? found[0] : undefined;
  };
  const rows = new Map<string, Outcomes>();
  const add = (item: string, outcome: string) => {
    const r = rows.get(item) ?? { item, tests: 0, passed: 0, failed: 0, errored: 0, skipped: 0 };
    r.tests++;
    r[outcome as "passed" | "failed" | "errored" | "skipped"]++;
    rows.set(item, r);
  };
  const cited = new Map<string, Set<string>>();
  for (const t of prepared.results) {
    const file = `${t.source}/${t.file}`;
    add(file, t.outcome);
    for (const id of t.cites) {
      const target = own.get(`${t.source}\u0000${t.file}\u0000${id}`) ?? any.get(id) ?? only(id);
      if (target === undefined) continue;
      add(target, t.outcome);
      if (t.outcome === "failed" || t.outcome === "errored") cited.set(file, (cited.get(file) ?? new Set()).add(target));
    }
  }
  const outcomes = [...rows.values()].sort((a, b) => compareCodePoints(a.item, b.item));
  const files = new Set(prepared.results.map((t) => `${t.source}/${t.file}`));
  const gaps: Gap[] = outcomes
    .filter((o) => files.has(o.item) && o.failed + o.errored > 0)
    .map((o) => {
      const c = [...(cited.get(o.item) ?? [])].sort(compareCodePoints);
      const what = o.errored > 0 && o.failed === 0 ? `could not run (${o.errored} errored)` : `${o.failed + o.errored} of ${o.tests} tests failed${o.errored > 0 ? ` (${o.errored} errored)` : ""}`;
      return { kind: "failing-test", subject: o.item, fragments: [], detail: `${what}${c.length > 0 ? `; they cite ${c.join(", ")}` : ""}` };
    });
  return { outcomes, gaps };
}
