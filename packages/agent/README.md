# @csh/agent

## Purpose

`@csh/agent` gives an agent every read the harness has, and a defined way to work against it, with no tool that commits
or signs a decision ([10](../../docs/spec/10-next-layers.md), section 6). It is a tool server over the Model Context
Protocol, speaking on standard input and output, started for one component: `csh-agent --root <component>`. Its
results are data an agent can consume without parsing text, and source text in them is marked as such.

## Where it sits

It is the "Agent tool server" container of the [containers diagram](../../docs/architecture/containers.mmd), called by
an agent's host; its functions are drawn in [components-agent.mmd](../../docs/architecture/components-agent.mmd). It is
outside the trusted base: it reads, runs, and writes only the run store and an A3 skeleton.

## Public interface

- `bin/csh-agent.js`: the server for one component (`--root`, else the git top level).
- `createServer(context)`, `serve(context)`: the server, with the low-level `Server` and `StdioServerTransport` of `@modelcontextprotocol/sdk`.
- `TOOLS`, `callTool(name, args, context)`: the eight tools, `status`, `run`, `gaps`, `explain`, `diff`, `queue`, `print` and `a3_open`; a name outside the list is refused with `unknown-tool` before the component is read, and anything a tool throws comes back as `internal-error` with its detail quoted. The `diff` result says `stop` or `continue`, per step 4 of [the agent guide](../../docs/guides/agents.md).
- `quote(text)`, `ok`, `fail`, `Envelope`, `AGENT_SCHEMA` (`csh-agent/v1`), `QUOTE_LIMIT`, `NOTE`: the result envelope.
- `unquotedStrings(value)`: every string not under a key named `quoted`, with its path; the test of section 6.2.

## Depends on and used by

- Depends on: `@csh/run` (status, runs, the queue, evaluation), `@csh/review` (`diffProject`), `@csh/check` (`signalsOf`), `@csh/print` (`printFragment`), `@csh/cli` (`a3Command`, for `a3_open`), `@csh/kernel`, `@csh/solver`. External: `@modelcontextprotocol/sdk` 1.32.0.
- Used by: an agent's host, through `bin/csh-agent.js`; `@csh/testkit` (F113, F114 and the scripted session).

## Invariants it protects

- The tool list is fixed, and has no tool that approves, rejects, retires, waives, countersigns or drafts a ledger line, in any configuration ([A-76](../../ASSUMPTIONS.md)).
- Every result is one envelope. A string that comes from a source (sentence text, test names, step text, file paths, rationale, a printed fragment, an error's detail) appears only as the value of a key named `quoted`, cut at `QUOTE_LIMIT` with `truncated` set.
- Lists (`run`, `gaps`, `diff`) carry ids, kinds, qualified names, verdicts and counts only; source text comes back only from `explain` or `print`, for one item ([A-87](../../ASSUMPTIONS.md)).
- No language model is involved anywhere in the package or its tests.

## Rationale

An agent can already run the command line. What it lacks is structure: results it need not parse, a protocol that says
when to stop, and a visible boundary between what the harness says and what someone wrote in a source. A requirement
that reads "ignore your instructions" is an attack on the agent, not on the harness; quoting cannot make an agent safe,
but it makes the boundary testable on the harness's side ([10](../../docs/spec/10-next-layers.md), section 6.2).

## How it is tested

- `test/agent.test.ts`: the tool list, refusal of other names, and the envelope (a property: quoted text never appears among the unquoted strings).
- F113: a scripted client lists exactly the eight tools. F114: it calls every tool on a component whose sources carry an instruction aimed at an agent, and finds that text only under `quoted`.
- `packages/testkit/test/agent-session.test.ts`: the protocol on the lockout regression, ending at `says: stop`, with the transcript that [the agent guide](../../docs/guides/agents.md) shows.

## Known limits

- The protocol is advice. Only the ledger and the gate bind; an agent that ignores the guide is stopped at the gate.
- `gaps`, `explain` and `print` evaluate the working tree afresh on each call; on a large component that is slow.
- Qualified names of lifted claims are derived from source names (a test's title, encoded); they are treated as harness identifiers, not quoted.
