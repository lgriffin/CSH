# Architecture (C4)

This tab shows the harness at the four C4 levels and lists the documentation the build must deliver with the code. The diagrams describe the design, not a built system.

## 1. Level 1: system context

&#91;embedded content: C4 level 1 · system context\]

Three kinds of actor reach the harness, and three outside systems surround it. A contributor and an AI agent can do the same things; the intent owner alone can sign a decision.

| Element | Role |
| --- | --- |
| Contributor | Writes specifications, tests and requirement text; reads findings |
| Intent owner | Approves, rejects, retires and waives, by signed commit |
| AI agent | Does what a contributor does; its output is always candidate |
| Version control | Holds specifications, sources, the ledger and maintainers file; provides commit identity and signatures |
| Existing practice | Test runs that record witnesses, and requirement documents |
| Continuous integration | Runs the enforcing gate on the commit being merged |

## 2. Level 2: containers

&#91;embedded content: C4 level 2 · containers\]

The command line drives three producers (emission, adapters, ledger), which feed two consumers (check engine, gate). Everything depends on the kernel, and the kernel on nothing.

| Container | Packages | Runs as | Trusted |
| --- | --- | --- | --- |
| Command line | `cli` | Main process | Yes |
| Emission sandbox | `emit`, `csl`, `print` | Locked-down subprocess per module | Launcher yes; module code no |
| Adapters | `adapter-witness-files`, `adapter-ears-markdown`, `witness` | Isolated subprocess per adapter | No |
| Ledger and authority | `ledger` | Main process, reads version control | Yes |
| Check engine | `check`, `solver` | Main process; solver behind a port | Yes |
| Gate | `gate` | Main process | Yes |
| Kernel | `kernel` | Library | Yes |

"Trusted" means a defect there could produce a false satisfied or a false approval. Those containers get the heaviest testing.

## 3. Level 3: components

&#91;embedded content: C4 level 3 · components of the check engine\]

The check engine is a pipeline: fragments are pooled, lifted claims are type-checked, queries are built and minimised, and findings, witness assessments and the gap view go into one report.

Components of the other containers:

| Container | Component | Responsibility |
| --- | --- | --- |
| Emission sandbox | Launcher | Starts the subprocess with access denied; enforces the time limit |
| Emission sandbox | Loader | Imports the module; checks the default export |
| Emission sandbox | Rule checker | Rules S6 to S9, phase table, naming |
| Emission sandbox | Canonical writer | Canonical JSON and digests, via the kernel |
| Adapters | Witness reader | Parses and validates witness records |
| Adapters | Example lifter | Turns passing records into example claims through bindings |
| Adapters | Sentence extractor | Finds identified EARS sentences; classifies pattern; digests text |
| Ledger and authority | Maintainers reader | Loads identities as of a given commit |
| Ledger and authority | Signature port | Verifies a commit's signature and returns the key fingerprint |
| Ledger and authority | Entry validator | The six validity rules |
| Ledger and authority | Authority resolver | Fragment name and digest to approved, candidate or retired |
| Gate | Snapshot builder | Commit, digests, ledger head, tool versions |
| Gate | Staleness checker | Compares stored dependency digests with the snapshot |
| Gate | Disposition table | Verdict, applicability and waiver to allow, review, block or waived |
| Gate | Decision writer | The gate decision record |
| Kernel | Typing | Types and units of expressions; phase rules |
| Kernel | Canonical form | Ordering, serialisation, digests |
| Kernel | Evaluator | Exact evaluation of an expression on concrete values |

## 4. Level 4: code

Level 4 is the type definitions already given: the model and expressions in the Semantic contract, the language surface in the Language reference, and the report, witness, ledger and gate records in their tabs. The build keeps those types as the single source and generates no parallel definitions.

## 5. One run, in sequence

1. The command line asks the emission sandbox for the model of each specification module.
2. Adapters read their sources and return claims, witnesses and cited items.
3. The ledger container reads the ledger and maintainers file at the snapshot commit and resolves the authority of every fragment.
4. The check engine pools fragments, runs the queries, minimises conflicts, judges witnesses, builds the gap view and writes the report.
5. The gate reads the report and the authority, checks staleness and waivers, and writes a decision for that snapshot.

Steps 1 to 4 need no ledger to be useful: with none present, every fragment is candidate and the report still shows gaps and joint conflicts.

## 6. Documentation the build must deliver

| Deliverable | Where | Content |
| --- | --- | --- |
| C4 as text | `docs/architecture/` | One diagram source file per level: context, containers, and a component diagram for every container; rendered images beside them |
| Root README | `README.md` | What the tool is for; the two findings; a five-minute walkthrough on the account example; how to read a report; limits |
| Package READMEs | `packages/*/README.md` | The template below |
| Decision records | `docs/adr/` | One file per row of the Rationale tab, plus one for every choice the implementer makes |
| Assumptions register | `ASSUMPTIONS.md` | Every provisional assumption made during the build (Implementer's brief, rule 2) |
| Stage notes | `docs/stages/` | One note per stage: built, effort, what the fixtures revealed |
| Walkthrough | `docs/walkthrough.md` | The account example end to end with real command output |

Package README template:

1. **Purpose** in two sentences.
2. **Where it sits:** its container and the diagram that shows it.
3. **Public interface:** exported types and functions, one line each.
4. **Depends on** and **used by.**
5. **Invariants it protects,** each tied to a principle or a CSH requirement.
6. **Rationale:** why it is shaped this way, linking decision records.
7. **How it is tested:** fixtures and property tests.
8. **Known limits.**

Two checks keep the documentation honest: a test fails when a package has no README or is missing from the container diagram source, and a test fails when a decision record cited in a README does not exist.
