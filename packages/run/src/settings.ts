// The practice settings each built-in adapter reads. A setting the adapter does not read is ignored by it, which looks
// exactly like a setting that worked: a mistyped name, or one that another adapter reads, changes nothing and says so
// nowhere. The run names it instead.

const ID = ["idPattern", "requirementIdPattern"];

/** Settings by adapter. An adapter missing here (a custom one) is not checked. */
export const ADAPTER_SETTINGS: Record<string, readonly string[]> = {
  "@csh/adapter-ears-markdown": ID,
  "@csh/adapter-items/markdown": [...ID, "headingFields", "verifiedField", "headings"],
  "@csh/adapter-items/gherkin": ["tagCites", "idTag"],
  "@csh/adapter-items/tests": [...ID, "citePattern", "citeBodies", "style"],
  // An Outputs source shares the tests practice and its settings, and reads none of them (stage 70).
  "@csh/adapter-items/outputs": [...ID, "citePattern", "citeBodies", "style"],
  "@csh/adapter-items/jsonl": ID,
  "@csh/adapter-items/yaml": [...ID, "collection", "idField", "textField", "edges", "fields", "silence"],
};

/** The settings given that the adapter does not read, each with the nearest one it does when there is one. */
export function unknownSettings(adapter: string, given: readonly string[]): { name: string; hint?: string }[] {
  const known = ADAPTER_SETTINGS[adapter];
  if (known === undefined) return [];
  return given.filter((g) => !known.includes(g)).map((name) => {
    const near = known.find((k) => k.toLowerCase() === name.toLowerCase() || k.startsWith(name) || name.startsWith(k));
    return near === undefined ? { name } : { name, hint: near };
  });
}
