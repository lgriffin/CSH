# Stage 51: Diagrams and the deck

**Exit:** the C4 diagrams show what the code holds after stage 50, and a Marp deck says what CSH is, how it works, how
it is designed and what it reports ([15](../spec/15-assertion-ladder.md), section 9).

**Status:** exit reached.

## Built

- `docs/architecture`: the component diagrams of the check engine, the architecture rules, the facts, the command line
  and the run redrawn, and the container descriptions of the check engine and the architecture rules updated; SVGs
  re-rendered with `@mermaid-js/mermaid-cli` 11. They had last changed at stage 29, so they now also show what stages
  22 to 44 added: trace, test results, the overview, expected results, the TypeScript and tree-sitter readers,
  structural claims, coverage, the proposal and the queue.
- [docs/deck/csh.md](../deck/csh.md): 22 slides in [Marp](https://marp.app), with two simplified diagrams beside it.
  Render with `npx @marp-team/marp-cli docs/deck/csh.md --allow-local-files --pdf`.

## Not done

- No package was added, so the container diagram, which the `Workspace` component checks, gains no container.
