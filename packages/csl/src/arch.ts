// The architecture builders (Next layers, section 4.1). Each returns plain data, an ArchRule or a selector, that
// s.architecture carries as the obligation's value; the check engine evaluates it against the diagram and the facts.
import type { ArchRule, ArchSel } from "@csh/kernel";
import type { SourceRef } from "./system.ts";

/** One package, by its name in the manifest or the part after its scope ("kernel" for "@csh/kernel"). */
export function pkg(name: string): ArchSel {
  return { k: "package", name };
}

/** Every package a container of the diagram holds, by the container's identifier. */
export function container(id: string): ArchSel {
  return { k: "container", id };
}

/** Any package at all. */
export const anything: ArchSel = { k: "any" };

/** No package selected by `from` depends on a package selected by `to`. */
export function forbid(from: ArchSel, to: ArchSel): ArchRule {
  return { k: "forbid", from, to };
}

/** The packages selected by `from` depend only on those selected by one of `to`, and on each other. */
export function only(from: ArchSel, to: readonly ArchSel[]): ArchRule {
  return { k: "only", from, to: [...to] };
}

/** Every dependency observed between containers is drawn in this diagram source: a missing arrow is a prohibition. */
export function closed(source: SourceRef): ArchRule {
  return { k: "closed", source: source.name };
}
