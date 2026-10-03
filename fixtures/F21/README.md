# F21

A second requirement from another source: withdrawals of at most 10,000 shall be Accepted. Each requirement is
satisfiable alone, but Q-FEAS is satisfiable: for an input such as balance 5,000, floor 0, amount 10,000 no outcome
meets both. The minimal set is the two requirements. The base example RejectAtBoundary also conflicts with the new
requirement under Q-EX, and the transition fails Q-MEET for the new requirement, since the model rejects a withdrawal
of at most 10,000 that would cross the floor. The document mentions neither, but its query definitions determine both
(QUESTIONS.md, Q-03).
Semantic contract, section 7.3; Joint evaluation, section 8.
