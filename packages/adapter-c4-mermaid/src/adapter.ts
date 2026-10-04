// The container diagram as a source (Next layers, section 4.2): reads the subset of Mermaid's C4Container text the
// repository uses into elements, the packages each container holds, and drawn relations, each with its line. A line it
// cannot read is kept as unliftable with its span, never dropped.
import type { ClaimSet } from "@csh/kernel";
import type { Adapter, AdapterInput, AdapterOutput, Diagram } from "@csh/witness";

export const manifest = {
  id: "csh.adapter.c4-mermaid",
  version: "0.1.0",
  ir: "csh-ir/v1",
  produces: ["diagram"],
  inputKinds: ["Architecture"],
} as const;

/** Elements read with their identifier; a Container's third argument lists the packages it holds. */
const ELEMENTS = new Set(["Container", "Person", "Person_Ext", "System", "System_Ext"]);
const BOUNDARIES = new Set(["System_Boundary", "Container_Boundary", "Enterprise_Boundary", "Boundary"]);

/** The arguments of a call such as Rel(a, b, "Label, with comma"): bare words and double-quoted strings. */
export function splitArgs(text: string): string[] | undefined {
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    while (text[i] === " ") i++;
    if (text[i] === '"') {
      const end = text.indexOf('"', i + 1);
      if (end < 0) return undefined;
      out.push(text.slice(i + 1, end));
      i = end + 1;
    } else {
      const end = text.indexOf(",", i);
      out.push(text.slice(i, end < 0 ? text.length : end).trim());
      i = end < 0 ? text.length : end;
    }
    while (text[i] === " ") i++;
    if (i < text.length) {
      if (text[i] !== ",") return undefined;
      i++;
    }
  }
  return out;
}

export function readDiagram(text: string, path: string): { diagram: Diagram; unliftable: { span: string; reason: string; text: string }[] } {
  const diagram: Diagram = { elements: [], relations: [] };
  const unliftable: { span: string; reason: string; text: string }[] = [];
  let header = false;
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    const span = `${path}:${i + 1}`;
    if (line === "" || line.startsWith("%%") || line === "}") return;
    if (!header && line === "C4Container") {
      header = true;
      return;
    }
    if (line.startsWith("title ")) return;
    const call = /^([A-Za-z_]+)\((.*)\)\s*(\{)?$/.exec(line);
    const args = call === null ? undefined : splitArgs(call[2]!);
    const name = call?.[1];
    if (header && name !== undefined && args !== undefined && args.length >= 2 && args[0] !== "") {
      if (BOUNDARIES.has(name) && call![3] === "{") return;
      if (ELEMENTS.has(name) && call![3] === undefined) {
        const packages = name === "Container" && args[2] !== undefined ? args[2].split(",").map((p) => p.trim()).filter((p) => p !== "") : [];
        diagram.elements.push({ id: args[0]!, kind: name, label: args[1]!, packages, span });
        return;
      }
      if (name === "Rel" && call![3] === undefined && args.length >= 3) {
        diagram.relations.push({ from: args[0]!, to: args[1]!, label: args[2]!, span });
        return;
      }
    }
    unliftable.push({ span, reason: "unreadable-line", text: line });
  });
  return { diagram, unliftable };
}

export function run(input: AdapterInput): AdapterOutput {
  const claims: ClaimSet = { source: input.source.name, assumptions: [], obligations: [], examples: [], unliftable: [] };
  const diagram: Diagram = { elements: [], relations: [] };
  for (const f of input.files) {
    const r = readDiagram(new TextDecoder().decode(f.bytes), f.path);
    diagram.elements.push(...r.diagram.elements);
    diagram.relations.push(...r.diagram.relations);
    claims.unliftable.push(...r.unliftable);
  }
  const out: AdapterOutput = { claims, diagram, diagnostics: [] };
  const ids = new Set(diagram.elements.map((e) => e.id));
  for (const r of diagram.relations) {
    for (const end of [r.from, r.to]) if (!ids.has(end)) out.diagnostics.push({ code: "unknown-element", severity: "warning", message: `relation names ${end}, which no element declares`, span: r.span });
  }
  return out;
}

export const adapter: Adapter = { manifest: { ...manifest, produces: [...manifest.produces], inputKinds: [...manifest.inputKinds] }, run };
