import { view } from "./view";

test("renders", () => {
  expect(view()).toMatchSnapshot();
});
