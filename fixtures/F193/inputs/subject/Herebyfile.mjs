import { task } from "hereby";

export const build = task({
  name: "build",
  run: async () => {},
});

export const test = task({
  name: "test",
  dependencies: [build],
  run: async () => {},
});
