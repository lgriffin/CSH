# Dependency rules

The written rules the `Workspace` component cites ([10](../spec/10-next-layers.md), section 4.4). Each sentence is
quoted from where it was first written; none is translated. The rules in `csh/spec/workspace.csl.ts` cite them, and
the container diagram and the code facts are checked against those rules. A rule here is not approved by being
written: approval is the owner's, through the ledger.

| ID | Rule |
| --- | --- |
| ARCH-001 | THE kernel package SHALL import nothing outside itself and the language's standard library. |
| ARCH-002 | THE adapters SHALL depend on the kernel and witness packages only. |
| ARCH-003 | THE container diagram SHALL draw every dependency between containers. |

The first is working rule 8 of [the implementer's brief](../spec/06-implementers-brief.md). The second is from the
same brief's package layout: "adapters depend on `kernel` and `witness` only". The third is the closed-world statement
of [10](../spec/10-next-layers.md), section 4.1, which the owner decides after the first run (A-73).
