# Stage 81: The Java subjects

**Exit:** Apache Camel and lgriffin/Hadur_Robot are labelled subjects with drifts files, held to them by the `labelled`
CI job as the TypeScript subjects are ([22](../spec/22-analysis-a3-and-1.0.md), section 4.1), and each false entry
their first labelling found is fixed or labelled with its reason.

**Status:** exit reached. `BUILT_THROUGH_STAGE` is 81; F231 to F233 hold the fixes.

## Why

Leigh, 28 October 2026: the Java benchmarks were to be mature Java projects tested formally before 1.0, not a smoke
run. Stage 79 ran Camel and Hadur_Robot in a non-gating `benchmark` job that reported counts; this stage reads them
cold, judges every entry, fixes what is false, and gates CI on the labels. Java stays experimental (A-275): the labels
measure the reader, and the TypeScript subjects still decide 1.0.

## Built

- **Labels** `evaluation/labels/camel.json` and `evaluation/labels/hadur.json`, and **drifts**
  `evaluation/drifts/camel.json` and `evaluation/drifts/hadur.json`. The two subjects move from the `benchmark` job to
  the `labelled` matrix.
- **Fixes** A-289 to A-301, each in [ASSUMPTIONS.md](../../ASSUMPTIONS.md): tests under a Java test root by any name;
  an issue tracker's keys; placeholders, files prose says to add, and ignored directories; words a test asserts in
  strings, and file names in grain; a Python test class's docstring; retired requirements; the register first, and a
  plan's requirements proposed; jqwik's tests; a Java test class a sentence names as its check; Java fields as
  declarations; teaching material lifts no told rules.

## What labelling found

| Subject | Open before | Open after | True | Precision |
| --- | ---: | ---: | ---: | ---: |
| Apache Camel `camel-4.23.0` | 46 | 36 | 33 | 92% |
| Hadur_Robot `91a3abf` | 154 | 47 | 38 | 81% |

- **Camel.** 24 example READMEs link `examples/README.md`, which the repository does not have: true, a Camel finding.
  The false entries before were Jira keys cited by tests (`CAMEL-19279`), `*IT` classes not read as tests, a
  `camel-4x-upgrade-guide-4_XX.adoc` placeholder, and a directory a README says to place a jar into.
- **Hadur_Robot.** The README links `RoundStats.java` at the wrong path, a bench note names `hadur-bench/Bench.java`,
  nine requirements' tests leave named terms unobserved, and ten requirements and eight layering rules name no check:
  true. The false entries before were the retired requirements, the plans' proposed requirements and their repeats of
  the register, jqwik property tests not read as tests, the course's sentences about the learner's robot, ArchUnit tests
  named in the sentence, and `.gitignore`d opponent jars.

## What seeding drift found

Hadur_Robot: a deleted bench tool the requirements' notes name, jqwik properties that stop tagging GUN-3, and the
battle export test no longer naming `FALLBACK_HEADER`; 3 of 3 reported, 54 of 54 entries keep their anchor. Camel:
`MojoHelper.java`, which `AGENTS.md` names, deleted, and the OpenAI batch mock test no longer naming
`replyWithBatchContent`; 2 of 2 reported, 43 of 43 entries keep their anchor. The first Camel drifts deleted the
order-generator example's `application.properties`, then its route, which its README names with no folder: such a
name that names no tracked file is unchecked (A-110), so neither was reported. Looking for another file the README
names showed that every example README names a Citrus test under `test/` that is not tracked, unchecked because `test/`
is neither at the root nor beside it (A-288). Both limits are recorded in [22](../spec/22-analysis-a3-and-1.0.md),
section 4.1, and [issue 107](https://github.com/lgriffin/CSH/issues/107) asks whether the second should be dangling.

The TypeScript subjects' labels are unchanged by these fixes.
