// Grain (Analyse, danger and grain, section 4; stage 57): the terms a statement constrains, and whether the tests citing
// it observe them.
import { describe, expect, it } from "vitest";
import { observesTerm, termsOf, unobserved, wordsOf } from "../src/index.ts";

describe("grain", () => {
  it("reads a statement's terms from its backticked identifiers, a dotted path as its last segment, and no file name", () => {
    expect(termsOf("The `retryWindow` of `Policy.floor` is kept; see `src/a.ts` and `a b` and `x()`")).toEqual(["retryWindow", "floor"]);
    expect(termsOf("No backticks at all")).toEqual([]);
    expect(termsOf("`schema.sql`, `index.html` and `go.mod` are files, not terms; `process.env` and `mutex.lock` are")).toEqual(["env", "lock"]);
  });

  it("splits an identifier into its words", () => {
    expect(wordsOf("retryWindowMs")).toEqual(["retry", "window", "ms"]);
    expect(wordsOf("HTTPServer")).toEqual(["http", "server"]);
    expect(wordsOf("validation_failed")).toEqual(["validation", "failed"]);
  });

  it("matches a term when its words stand together among an identifier's", () => {
    expect(observesTerm(["hasResponseSchema"], "responseSchema")).toBe(true);
    expect(observesTerm(["retry_window"], "retryWindow")).toBe(true);
    expect(observesTerm(["windowRetry"], "retryWindow")).toBe(false);
    expect(observesTerm(["windows"], "window")).toBe(false);
  });

  it("names the terms no citation observes, and makes no comparison it cannot make", () => {
    expect(unobserved(["window", "floor"], [{ span: "a:1", observes: ["lockWindow"] }, { span: "b:1", observes: ["x"] }])).toEqual(["floor"]);
    expect(unobserved(["window"], [{ span: "a:1", observes: ["window"] }])).toEqual([]);
    expect(unobserved([], [{ span: "a:1", observes: [] }])).toBeUndefined();
    expect(unobserved(["window"], [])).toBeUndefined();
    expect(unobserved(["window"], [{ span: "a:1", observes: ["window"] }, { span: "b:1" }])).toBeUndefined();
  });
});
