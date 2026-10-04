# Stage 20: Agent interface

**Exit:** F113 to F117 pass, and a scripted client, with no language model, follows the protocol on the lockout
regression and receives the diff that says stop ([10](../spec/10-next-layers.md), section 9). Every earlier fixture
and both walkthroughs stay green.

**Status:** exit reached.

## Built

- `agent` (new, outside the trusted base): the tool server over the Model Context Protocol on standard input and output, `csh-agent --root <component>`, with the eight tools of section 6.1 and no tool that decides ([A-76](../../ASSUMPTIONS.md)). Every result is a `csh-agent/v1` envelope with source text only under `quoted` ([A-87](../../ASSUMPTIONS.md)). The `diff` tool says `stop` or `continue` ([A-90](../../ASSUMPTIONS.md)). It uses the low-level server of `@modelcontextprotocol/sdk` 1.32.0.
- `ledger`: `provenance` and `authoredByOf`; `authorship` is now built on them. `run`: `fragmentProvenance`, `fileProvenance`, and `authoredBy` on each assessment once a maintainers file was committed ([A-88](../../ASSUMPTIONS.md)); `componentQueue` and `renderQueue` ([A-89](../../ASSUMPTIONS.md)); `queueLimit` in `csh/config.json`.
- `check`: `authoredBy` on `Assessment`, printed with the authority. `a3`: `authoredBy` in the header of the sheet, which every committed A3 now shows (`unknown`, since their judgments were committed unsigned).
- `cli`: `csh queue`; `a3Command` exported for the agent. `review`: the side resolution of `csh diff` moved here (`diffProject`), shared by `csh diff` and the agent.
- `testkit`: `BUILT_THROUGH_STAGE` is 20; `agent`, `queue` and `authoredBy` expectations; the scripted session, `test/agent-session.test.ts`; the triangle knows the `agent` container.

## Fixtures

All five pass: F113 (the server lists exactly the eight tools), F114 (an instruction aimed at an agent, in a requirement
sentence, reaches the client only under `quoted`, through every tool), F115 (`authoredBy` is `person`, `agent` and
`unknown` for a commit signed by a person, one signed by an agent, and an unsigned one), F116 (the queue: the two
bindings first, since each unlocks both rules, and a warning past its limit of 2), F117 (an approval committed under an
agent's key is invalid, `agent-key`, and `csh status` lists it). F117 needed no new code: the ledger has refused an
agent's key since stage 7, and `csh status` shows invalid entries since stage 17.

## The scripted session

The test builds the lockout example with its countermeasures and model, commits a maintainers file listing a person and
an agent, and approves every rule and binding with the person's test-only key. A scripted client then calls `status`
and `run`, commits the regression with the agent's key, calls `run`, and calls `diff` against where it started. The diff
says stop: `LockOnThirdFailure` is approved and went from satisfied to violated, while the tests stayed green. The
transcript is in [the agent guide](../guides/agents.md), and the test fails if it changes.

## The three corners

- C4: the container diagram gains `agent`, the agent as a person beside it, and the relations its code adds; the context diagram says the agent works through the tool server; [components-agent](../architecture/components-agent.mmd) is new, and the review diagram gains its sides.
- Docs: [the agent guide](../guides/agents.md), written for an agent; the README of `agent`; `ledger`, `run`, `check`, `a3`, `cli` and `review` READMEs; the root README's executed `csh queue` block and its Agents section; [A-87 to A-90](../../ASSUMPTIONS.md).
- Examples: the lockout example names the scripted session as the command that reaches the agent container.

## What proved wrong or costly in the documents

- F114's README says an unreadable line of the requirements file carries the instruction too. The EARS adapter reads only identified table rows and skips other prose without reporting it, so that line never enters a result at all; the sentence `SHIP-003` is the one that reaches the client, under `quoted`.
- Section 6.2 lists file paths among source text, and a signal's subject is often a path or an item; in lists it is left out, and `explain` returns it quoted ([A-87](../../ASSUMPTIONS.md)).
- Computing `authoredBy` on every evaluation would change the stored reports of every component, the gate's included, and emit the specification at every commit that touched it; it is filled in only once a maintainers file exists ([A-88](../../ASSUMPTIONS.md)).
- "What approving it would unlock" is not defined; a binding unlocks the rules whose reasons name it, which gives F116's order ([A-89](../../ASSUMPTIONS.md)).
