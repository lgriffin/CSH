import { describe, expect, it } from "vitest";
import { unknownSettings } from "../src/settings.ts";

describe("practice settings", () => {
  it("names a setting the adapter does not read, with the nearest one it does", () => {
    expect(unknownSettings("@csh/adapter-items/gherkin", ["tagCites", "idtag", "bogus"])).toEqual([{ name: "idtag", hint: "idTag" }, { name: "bogus" }]);
    expect(unknownSettings("@csh/adapter-ears-markdown", ["idPattern"])).toEqual([]);
  });

  it("says nothing about an adapter it does not know, or a setting another adapter reads", () => {
    expect(unknownSettings("./my-adapter.js", ["anything"])).toEqual([]);
    expect(unknownSettings("@csh/adapter-items/gherkin", ["citePattern"])).toEqual([{ name: "citePattern" }]);
  });
});
