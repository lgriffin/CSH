import { price } from "./format";

describe("price", () => {
  it("shows two decimals", () => {
    expect(price(1)).toMatchSnapshot();
  });
});
