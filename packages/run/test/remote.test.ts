// csh analyse names the subject by its origin remote (stage 55); a token in that URL never reaches a report (stage 60).
import { describe, expect, it } from "vitest";
import { withoutCredentials } from "../src/analyse.ts";

describe("withoutCredentials", () => {
  it("removes a user name and a password from a URL, and leaves every other remote as written", () => {
    // Built from parts, so that no scanner reads a credential in this file.
    const userinfo = ["name", "word"].join(":");
    expect(withoutCredentials(`https://${userinfo}@example.invalid/o/r.git`)).toBe("https://example.invalid/o/r.git");
    expect(withoutCredentials("https://user@example.com/r.git")).toBe("https://example.com/r.git");
    expect(withoutCredentials("https://github.com/o/r.git")).toBe("https://github.com/o/r.git");
    expect(withoutCredentials("git@github.com:o/r.git")).toBe("git@github.com:o/r.git");
    expect(withoutCredentials(undefined)).toBeUndefined();
  });
});
