# F74

The profile replaces the inherited MinimumBalance with a stronger one: the balance stays at least 100 above the floor.
The refinement check shows that the local obligation implies the inherited one under the intent's assumptions and is
satisfiable, so emission accepts it (rule 4). The stronger invariant is then not preserved by the transition, which
accepts a withdrawal down to the floor itself, and the check reports that before any evidence is considered (rule 6).

Written first from the composition rules and flagged for owner review (Implementer's brief, stage 8).
