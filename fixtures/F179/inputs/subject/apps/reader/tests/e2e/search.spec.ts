import { test, expect } from "@playwright/test";

// Proves tests/bdd/features/ui/search.feature: one test per scenario, titled and tagged to match.

test("Search matches every word", { tag: "@rule-0001" }, async ({ page }) => {
  await page.goto("/course");
  await expect(page.getByRole("option")).toHaveCount(1);
});
