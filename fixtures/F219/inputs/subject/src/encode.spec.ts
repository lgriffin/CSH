import { encode } from "./encode";

it("encodes", () => {
  expect(encode("a b")).toBe("a%20b");
});
