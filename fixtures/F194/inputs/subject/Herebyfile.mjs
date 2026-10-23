import { task } from "hereby";

function generator(name) {
  return task({
    name,
    run: async () => {},
  });
}

export const generateAst = generator("generate:ast");
