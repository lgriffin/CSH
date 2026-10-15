import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";

const feature = await loadFeature("tests/bdd/features/course.feature");

describeFeature(feature, ({ Rule }) => {
  Rule("When a student opens a course, the reader shall show its title.", ({ RuleScenario }) => {
    RuleScenario("Opening shows the title", ({ Given, Then }) => {
      Given("the course is open", () => {});
      Then("the title is shown", () => {});
    });
  });
});
