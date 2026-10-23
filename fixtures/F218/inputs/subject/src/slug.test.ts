import { describe, expect, test } from "vitest";
import { slug } from "./text";

describe("slug", () => {
  test.each([["A b"], ["C"]])("turns %s into a slug", (input) => {
    expect(slug(input)).toMatchSnapshot();
  });

  const kind = "unicode";
  test(`keeps ${kind} letters`, () => {
    expect(slug("é")).toMatchSnapshot();
  });

  test("drops spaces at the ends", () => {
    expect(slug(" a ")).toMatchSnapshot();
  });
});
