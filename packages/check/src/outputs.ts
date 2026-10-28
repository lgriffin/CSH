// Accepted outputs (Reading test suites as evidence, section 2; stage 70): what the pairing of each directory of
// accepted outputs found, as results. A suite whose cases have outputs converges on what the names show; an output with
// no case is a gap; cases with no output, a stem two cases share, and outputs no convention pairs, are indeterminate. CSH never compares an output with what the code would write today: that is the runner's verdict. A
// snapshot entry that names no test of its file is a gap, and one CSH cannot match to a title it can read is
// indeterminate (section 3; stage 71).
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
      const files = plural(Number(a.outputs ?? "0"), "file");
      const entries = a.entries === undefined ? "" : `; ${a.entriesMatched ?? "0"} of ${plural(Number(a.entries), "snapshot entry", "snapshot entries")} ${a.entriesMatched === "1" ? "names" : "name"} a test of the file`;
      const have = paired === 1 ? "has" : "have";
      const how = caseDir !== undefined
        ? `${paired} of ${plural(cases, "case")} under ${caseDir} ${have} accepted outputs, ${files} under ${outDir}`
        : a.elsewhere === "true"
          ? `${paired} of ${plural(cases, "case")} ${have} accepted outputs, ${files} in ${it.id}`
          : `${paired} of ${plural(cases, "case")} in ${it.id} ${have} accepted outputs, ${files}`;
      gaps.push({ kind: "accepted-outputs", subject: at(it.id), fragments: [], detail: `${conventions}: ${how}${entries}; the runner compares each case with them` });
    }
    // One JSON record a line, as a key may hold any character.
    for (const line of lines(a.obsolete)) {
      const { snapshot, key, test } = JSON.parse(line) as { snapshot: string; key: string; test: string };
      // A Jest, Vitest or syrupy file holds many entries; any other output is one, named after its test (A-269).
      const entry = /(?:^|\/)__snapshots__\/[^/]+\.(?:snap|ambr)$/.test(snapshot);
      const why = entry ? "and every title in it is a literal; the runner keeps the entry and no test reads it" : "and CSH read every test it could be; the file stays and no test reads it";
      gaps.push({ kind: "obsolete-snapshot", subject: `${at(snapshot)}::${key}`, fragments: [], detail: `${key.replace(/ \d+$/, "")}: no test of ${test} has this name, ${why}` });
    }
    for (const line of lines(a.undecided)) {
      const { snapshot, test, entries, lines: at_ } = JSON.parse(line) as { snapshot: string; test: string; entries: number; lines: number[] };
      gaps.push({ kind: "snapshot-undecided", subject: at(snapshot), fragments: [], detail: `${plural(entries, "entry", "entries")} name no test CSH can read in ${test}, whose titles at ${at_.map((l) => `${test}:${l}`).join(", ")} it cannot read; which test each names is not decided` });
    }
    // One entry for the suite (Q-85; A-287): a runner skips cases by name or option, or accepts that a case writes
    // nothing, and CSH does not read it, so which of these cases checks nothing by accident is not decided.
    const unaccepted = lines(a.unaccepted);
    if (unaccepted.length > 0) {
      const shown = unaccepted.length > 10 ? `${unaccepted.slice(0, 10).join(", ")} and ${unaccepted.length - 10} more` : unaccepted.join(", ");
      const have = unaccepted.length === 1 ? "has" : "have";
      gaps.push({ kind: "unaccepted-case", subject: at(it.id), fragments: [], detail: `${plural(unaccepted.length, "case")}${caseDir !== undefined ? ` under ${caseDir}` : ""} ${have} no accepted output under ${outDir} with its stem: ${shown}; the runner may skip each on purpose, by name or by an option, or accept that it writes nothing, or it never accepted what the case writes` });
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
