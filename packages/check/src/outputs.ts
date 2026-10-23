// Accepted outputs (Reading test suites as evidence, section 2; stage 70): what the pairing of each directory of
// accepted outputs found, as results. A suite whose cases have outputs converges on what the names show; a case with
// no output and an output with no case are gaps; a stem two cases share, and outputs no convention pairs, are
// indeterminate. CSH never compares an output with what the code would write today: that is the runner's verdict.
import type { SourceItem } from "@csh/witness";
import type { Gap } from "./types.ts";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const lines = (s: string | undefined) => (s === undefined || s === "" ? [] : s.split("\n"));

/** The results of the suite items an Outputs source read. */
export function outputGaps(items: readonly (SourceItem & { source: string })[]): Gap[] {
  const gaps: Gap[] = [];
  for (const it of items) {
    if (it.kind !== "suite") continue;
    const a = it.attrs ?? {};
    const at = (path: string) => `${it.source}/${path}`;
    const conventions = lines(a.conventions).join(", ");
    const cases = Number(a.cases ?? "0");
    const paired = Number(a.paired ?? "0");
    const caseDir = a.caseDir;
    const outDir = a.outDir ?? it.id;
    if (paired > 0) {
      const where = caseDir !== undefined ? `under ${caseDir}` : `in ${it.id}`;
      gaps.push({ kind: "accepted-outputs", subject: at(it.id), fragments: [], detail: `${conventions}: ${paired} of ${plural(cases, "case")} ${where} ${paired === 1 ? "has" : "have"} accepted outputs, ${plural(Number(a.outputs ?? "0"), "file")}${caseDir !== undefined ? ` under ${outDir}` : ""}; the runner compares each case with them` });
    }
    for (const c of lines(a.unaccepted)) {
      gaps.push({ kind: "unaccepted-case", subject: at(c), fragments: [], detail: `${c}: no accepted output under ${outDir} has its stem; the runner may skip it on purpose, or accept that it writes nothing, or it has never accepted what the case writes` });
    }
    for (const line of lines(a.orphans)) {
      const [output, names] = line.split("\t");
      const why = names === caseDir ? `no case under ${names} has its stem` : `it names ${names}, which does not exist`;
      gaps.push({ kind: "orphan-output", subject: at(output!), fragments: [], detail: `${output}: ${why}, so nothing produces it and it checks nothing` });
    }
    // One JSON record a line, since a path may hold a space or a tab.
    for (const line of lines(a.shared)) {
      const { stem, cases: cs, outputs } = JSON.parse(line) as { stem: string; cases: string[]; outputs: string[] };
      gaps.push({ kind: "shared-stem", subject: at(stem), fragments: [], detail: `${cs.join(", ")} share the stem ${stem.slice(stem.lastIndexOf("/") + 1)}; which of them wrote ${outputs.length === 0 ? "its outputs" : outputs.join(", ")} is not decided` });
    }
    const unpaired = Number(a.unpaired ?? "0");
    if (unpaired > 0) {
      gaps.push({ kind: "unpaired-outputs", subject: at(it.id), fragments: [], detail: `${plural(unpaired, "file")} no convention pairs (${a.unpairedWhy ?? ""}), e.g. ${a.unpairedSample ?? ""}` });
    }
  }
  return gaps;
}
