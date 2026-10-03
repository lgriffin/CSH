# ADR-35: The A3 is a pure function of files; the command line finds its inputs

Source: Anchor, harnesses and A3, sections 5 and 7 ([09](../spec/09-anchor-harness-a3.md)).

## Context

The lockout example built its A3 with a script that read saved reports and searched signal text. The product needs
the same sheet for any component, its numbers reproducible in continuous integration, and its authority taken from
the ledger. Section 7 makes `a3` an untrusted package that depends only on `component`, `check` and `kernel`.

## Decision

`@csh/a3` builds the model (`csh-a3/v1`) from the judgments, the stage records, an authority and a function that
returns a file as it stood at a stage's commit, and renders Markdown and HTML from the model alone. It reads no
clock, no ledger and no git. `csh a3` in `@csh/cli` finds those inputs: a commit's stored run (or a run at the commit
through `@csh/run`), the judgments' authority through `@csh/ledger` under the name `<component>/#a3/<slug>`, and files
through git. `csh approve #a3/<slug>` drafts a decision on the judgments' digest like any other. The model leaves out
commit hashes, so the lockout walkthrough's committed sheet is the fixture of every count it documents, and
`csh a3 build --check` replaces the script's own count checks.

## Alternatives

Put the commands in `@csh/run`: it already runs commits, but it is trusted, and the A3 has no reason to be. Let the
package read git and the ledger itself: shorter, but then the same inputs could give different sheets, and the
package would need the ledger, which section 7 does not give it.

## Consequences

The lockout example's `a3/` directory is gone; its judgments live in `csh/a3/three-practices/judgments.json` with
structured rules, and its sheet in `a3.md`, `a3.html` and `a3.json` beside them. The path-specific highlighting of
the example's page is dropped. The fixtures F91 to F95 build the model directly from files.

## Status

Accepted provisionally (implementer's choice; stage 14)
