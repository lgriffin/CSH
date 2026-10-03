# ADR-25: Decision commands draft a ledger line and never commit

Source: Authority tab, section 3.4; Implementer's brief, rule 3.

## Context

The tool may be driven by an agent, and an agent must not be able to approve.

## Decision

`csh approve`, `reject`, `retire`, `waive` and `countersign` print the fragment through the printer, with its findings and gaps. They then append one line to `csh/ledger.ndjson` and stop. The person commits that file alone, signed with their own key.

## Alternatives

Committing and signing from the tool.

## Consequences

Approving takes one more manual step. The CLI test checks that HEAD does not move (`packages/cli/test/cli.test.ts`).

## Status

Accepted provisionally (implementer's choice; first build)
