# ESI.ts, a subject profile

This directory evaluates [ESI.ts](https://github.com/lgriffin/ESI.ts) from outside. ESI.ts is the owner's TypeScript client for the EVE Online ESI API. The profile is pinned to commit `2a2da8a` (v11.3.0). ESI.ts is only read; nothing is written to it ([11](../../docs/spec/11-ingesting-a-codebase.md)).

```
node packages/cli/bin/csh.js subject fetch --root subjects/esi-ts   # clone ESI.ts at the pinned commit
node packages/cli/bin/csh.js run --root subjects/esi-ts             # evaluate it
```

The clone, the runs and the reports stay under this directory's `.csh-cache/` and `reports/`, which git ignores. ESI.ts is GPL-3.0 and CSH is MIT, so only identifiers, paths, spans and digests from ESI.ts are committed here, never its text ([#37](https://github.com/lgriffin/CSH/issues/37)).

## What it reads

| Stage | Practice | Source | Result at `2a2da8a` |
| --- | --- | --- | --- |
| 21 | Charter | `guides/CHARTER.md` | 0 items and the warning `no-items`: the 66 requirements are headings, which the EARS adapter does not read yet |

Each later stage adds a row, until the eleven disagreements listed in [11](../../docs/spec/11-ingesting-a-codebase.md) are reported or listed as unknown with a reason.
