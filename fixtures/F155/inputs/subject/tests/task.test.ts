import { expect, test } from "vitest";
import { create } from "../src/domain/task.ts";

test("R-FLOW-1: given no tasks, when a task is created, then it starts in todo", () => {
  expect(create()).toBe("todo");
});
