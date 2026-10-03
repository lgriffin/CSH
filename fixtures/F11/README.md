# F11

The transition loses its `otherwise` branch, so a rejected withdrawal leaves the state unconstrained (P10).
Q-PRES fails for MinimumBalance with a counterexample, and Q-MEET fails for RejectInsufficientFunds; both have
scope specification. The gap view lists both fields as unconstrained on the otherwise branch. Semantic contract, section 7.2.
