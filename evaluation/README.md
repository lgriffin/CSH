# Evaluation

The benchmark behind CSH 1.0 ([22](../docs/spec/22-analysis-a3-and-1.0.md), section 4). CI runs both jobs below on every
push; neither writes into a subject.

## Labelled subjects (stage 79)

Each file in `labels/` judges every gap and indeterminate entry of one subject's cold analysis, at one commit, true or
false, with a sentence a reviewer can check against the repository. `csh analyse <dir> --labels <file>` prints the
precision overall and per kind, and fails when an open entry is unlabelled, a label names no entry, the labels judge
another commit, or a refuted entry is labelled false. The `labelled` job in CI runs it on each subject, so a change to
CSH that adds, drops or renames an entry fails until its labels are updated by hand.

- **True:** the entry is right about the repository, and acting on it would be right. An indeterminate entry is true
  when CSH cannot decide it from what it reads, and false when a file it reads, or could read with a reader it has,
  decides it.
- **False:** for `unverified`, a sentence that is no rule about the code (a description, history, a plan, a schedule,
  an external fact) or that names its own check; for anything else, test data, or a file that says otherwise.

| Subject | Repository | Commit | Open | True | Precision |
| --- | --- | --- | ---: | ---: | ---: |
| `esi-ts` | lgriffin/ESI.ts | `2a2da8a` | 47 | 30 | 64% |
| `tutors-mono-repo` | tutors-sdk/tutors-mono-repo | `d350404` | 73 | 61 | 84% |
| `taskboard` | lgriffin/AI-Reference-Projects | `ce2767c` | 4 | 4 | 100% |
| `typescript-go` | lgriffin/TypeScript | `a91e938` | 18 | 17 | 94% |

Most false entries left are `unverified` sentences lifted as rules that describe rather than rule, and names declared
in code outside the code practice (ESI.ts's `scripts/`).

## Experimental benchmarks

Java, read cold on Apache Camel at `camel-4.23.0` and lgriffin/Hadur_Robot at `91a3abf`. The `benchmark` job reports
their counts, time and peak memory; they are not labelled and never fail the workflow.

`fetch.sh` fetches one commit of a repository at depth 1; `measure.sh` analyses it and writes the result, the time and
the peak memory to the job summary.
