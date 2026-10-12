# Stage 48: Told

**Exit:** F145. `csh init --subject` proposes the files an agent reads every session as their own practice, and
counts two-part identifiers such as `R-FLOW-1` as one family ([14](../spec/14-assertion-ladder.md), section 5).

**Status:** exit reached.

## Built

- `component`: the practice kind `instructions`.
- `run` (`propose`): `INSTRUCTION_FILES` (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, and `.github/copilot-instructions.md`)
  as the source `Instructions`; two-part identifiers counted first, with the family `X-[A-Z]+`; requirement documents
  found by headings and table rows; instruction files kept out of the other documents.
- [A-167](../../ASSUMPTIONS.md) and [A-168](../../ASSUMPTIONS.md).

## What the fixture revealed

- Before this stage, the proposal on AI-Reference-Projects guessed the family `FLOW-` from `R-FLOW-1`, and read
  `AGENTS.md` as one more document. It now guesses `(?:R-[A-Z]+)-[0-9]+`, six instruction files and three
  requirement documents, which is what the paper's receivers hold.

## Not done

- Paths that a document in a subdirectory writes relative to its own directory ([Q-45](../../QUESTIONS.md)).
