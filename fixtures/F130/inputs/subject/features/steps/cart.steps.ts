// Cucumber-style step definitions; the registrars stand in for @cucumber/cucumber's.
type Register = (text: string, fn: (...args: never[]) => void) => void;
const Given: Register = () => {};
const When: Register = () => {};
const Then: Register = () => {};

Given("an empty cart", function () {});
When("the shopper adds a {word}", function (_item: string) {});
Then("the cart holds {int} item", function (_n: number) {});
Then("the total is {int}", function (_n: number) {});
