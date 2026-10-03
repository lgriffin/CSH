# Stage 10: Component and run

**Exit:** F80, F81, plus the 51 earlier fixtures and both walkthroughs.

**Status:** exit reached.

## Built

- `component`: the manifest `csh/component.json` (`csh-component/v1`), its structural validation, and its check against the emitted specification, which gives the errors `component-name-mismatch`, `practice-unknown-source` and `harness-file-unread`, and the new gap `unowned-source`.
- `run`: the project loader, source runner, adapter runner and pipeline moved here from `cli` ([ADR-33](../adr/ADR-33-run-package.md)), plus one shared evaluation for `csh check`, `csh gate` and `csh run`, the harness runner, the run record `csh-run/v1` stored under `.csh-cache/runs/<snapshot digest>/`, and `runAt` for a past commit ([A-38](../../ASSUMPTIONS.md)).
- `csh run` and `csh init`. The snapshot gains `componentDigest`; the gate's decision logic is unchanged.
- The lockout example has a manifest, and `walkthrough.sh` runs every stage with `csh run`. Its A3 is unchanged byte for byte.

## Effort

Medium: about 180 lines in `component`, 200 in the run itself, 95 in `csh init`, and the move of about 580 lines of pipeline. One correction round: git paths were relative to the repository top, which breaks a component below it (the gate component of stage 15 lives in `packages/gate`), so `gitVcs` and the project now rebase paths by `git rev-parse --show-prefix`.

## What the fixtures revealed

- F80: a manifest error has to stop the run before any source is read; otherwise a practice naming an unknown source would surface as an unrelated missing-source diagnostic.
- F81: an unowned source is a gap, not an error, so a team can add a source before deciding which practice owns it.

## What proved wrong or costly in the documents

- The design gives `csh/config.json` and the manifest overlapping fields (`spec`, implementation paths, adapters). Choosing one silently would hide a mistake, so a project that sets both is refused with `config-superseded`. Recorded in the run package's README.
- The design does not say where a past commit's run is stored. It goes under the working project's `.csh-cache/runs/`, keyed by that commit's snapshot digest, since the worktree is thrown away.
