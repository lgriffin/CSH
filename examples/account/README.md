# Account example

The account service of the main tab, section 7.2, with three sources from existing practice:

- `test/account.test.ts`: unit tests that record witnesses to `reports/witnesses.ndjson`.
- `docs/requirements.md`: structured requirements in EARS form.
- `docs/design-notes.json`: a design note that no vocabulary can express, held as unliftable.

[docs/walkthrough.md](../../docs/walkthrough.md) runs the harness on it, step by step, with real output.
`walkthrough.sh` reproduces that run in a scratch copy.

## Containers it exercises

Checked against [the container diagram](../../docs/architecture/containers.mmd) and the commands this example runs
(`packages/testkit/test/triangle.test.ts`).

- `cli`: the `csl` and `csh` commands
- `kernel`: the model, canonical JSON and digests, under every command
- `emission`: `csl emit`, and the emission inside every evaluation
- `adapters`: the witness and EARS adapters, inside every evaluation
- `check`: the queries, the gap view and the report
- `gate`: the gate decision
- `ledger`: `csh approve` drafting ledger lines, and authority from signed commits
- `harness`: the probe in the unit tests, and the reporter
