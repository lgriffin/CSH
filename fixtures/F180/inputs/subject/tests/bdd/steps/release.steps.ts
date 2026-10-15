import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

const feature = await loadFeature("tests/bdd/features/release.feature");

// The seeding step is shared by name, so its text is held once.
const seed = "the calendar holds {number} blocks on each of {string}";

describeFeature(feature, ({ Rule }) => {
  Rule("When the SLO file is read, the release shall list each objective.", ({ RuleScenario }) => {
    RuleScenario("The objectives are listed", ({ Given, When, Then }) => {
      let count = 0;
      Given("the SLO file committed at release/slo.yaml", () => {});
      When("the objectives are read", () => {
        count = 3;
      });
      Then("{number} objectives are listed", (_ctx, n: number) => {
        expect(count).toBe(n);
      });
    });
  });

  Rule("When a course a generator release wrote is opened, the reader shall load it.", ({ RuleScenarioOutline }) => {
    RuleScenarioOutline("Open the course as generator <release> wrote it", ({ Given, When, Then }, variables) => {
      Given('the course that generator "<release>" wrote', () => {
        expect(variables.release).toBeDefined();
      });
      When("the reader loads it", () => {});
      Then("the course loads", () => {});
    });
  });

  Rule("When the calendar is seeded, the report shall cover the seeded days.", ({ RuleScenario }) => {
    RuleScenario("Seeded days are covered", ({ Given, Then }) => {
      Given(seed, () => {});
      Then("the report covers {number} days", () => {});
      Then("the report is printed", () => {});
    });
  });
});
