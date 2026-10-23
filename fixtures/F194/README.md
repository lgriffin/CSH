# F194

Open task sets, commands that name no task, and a command in a fence
([20](../../docs/spec/20-symbols-and-task-runners.md), sections 2 and 4; stage 68).

- `Herebyfile.mjs` makes a task whose name is a parameter, so its tasks are an open set: `npx hereby generate:all` is
  unchecked, as is `generate:ast`, which the text names.
- `Makefile` includes `common.mk`, so its targets are an open set: `make release` is unchecked.
- `npx hereby --tasks` and `make -C tools fetch` start with an option, and name no task.
- There is no justfile, so `just fmt` is unchecked.
- `pnpm run ghost` is in a fence, so it is not read, although package.json has no such script.

`docs/dev.md` is no dangling reference.

The expected result was written from the specification before the code.
