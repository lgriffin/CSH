# F75

The profile replaces the inherited MinimumBalance with a weaker one, allowing the balance 500 below the floor, without
saying so. The refinement check finds a state where the local obligation holds and the inherited one does not, so
emission refuses it with E-WEAKEN: weakening is never presented as refinement (rule 5).

Written first from the composition rules and flagged for owner review (Implementer's brief, stage 8).
