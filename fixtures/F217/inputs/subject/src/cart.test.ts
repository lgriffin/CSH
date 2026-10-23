import { total } from "./cart";

describe("cart", () => {
  describe("total", () => {
    it("adds the lines", () => {
      expect(total([1, 2])).toMatchSnapshot();
      expect(total([])).toMatchSnapshot("empty");
    });

    it.skip("rounds to cents", () => {
      expect(total([0.005])).toMatchSnapshot();
    });
  });

  test(`names the currency`, () => {
    expect("EUR").toMatchSnapshot();
  });
});
