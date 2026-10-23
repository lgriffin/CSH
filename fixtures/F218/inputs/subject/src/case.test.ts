import { describe, expect, it } from "vitest";
import { upper } from "./text";

describe("case", () => {
  describe("upper", () => {
    it("shouts", () => {
      expect(upper("a")).toMatchSnapshot();
      expect(upper("b")).toMatchSnapshot("loud");
    });
  });
});
