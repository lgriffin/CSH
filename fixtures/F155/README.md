# F155

What an agent is told, proposed by `csh init --subject` ([15](../../docs/spec/15-assertion-ladder.md), section 5;
stage 50). The subject keeps its rules in `REQUIREMENTS.md` as a table whose first cell is an identifier with two parts
(`R-FLOW-1`, `R-FLOW-2`, `R-WIP-1`), and tells agents how to work in `AGENTS.md`, `CLAUDE.md`, `service/AGENTS.md` and
`.github/copilot-instructions.md`.

- The identifiers are one family, `R-`, written `R-[A-Z]+`; `FLOW-1` inside `R-FLOW-1` is not counted as a family of
  its own, so the pattern is `(?:R-[A-Z]+)-[0-9]+`.
- `REQUIREMENTS.md` defines its rules in table rows, so it is a requirements document.
- The four instruction files are one source, `Instructions`, in a practice of kind `instructions`, and none of them
  is also a document. `README.md` and `docs/guide.md` are documents.

Run as proposed, `R-FLOW-1` and `R-WIP-1` are items of `Requirements`, and the test cites `R-FLOW-1`.

The expected result was written from the documents before the fixture was first run.
