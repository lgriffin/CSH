# F174

The TypeScript receiver's masked case. `DomainIgnoresHttp` (REQ-2) forbids the domain any import of the HTTP layer,
and `src/domain/board.ts` imports `../http/status.ts` on line 2, so the rule is violated. The committed Vitest report
says the test that cites REQ-2 passed, and nothing citing it failed: what reads green is a test whose result the code
refutes. The violation is masked danger, green over refuted, naming the item the passing tests cite; it is the only
danger. REQ-1's passing test cites nothing the code refutes. Analyse, danger and grain, section 3 (masked danger from
committed results) and Q-53; exit of stage 59, with F175 to F178.

The expected result was written from the documents before the fixture was first run.
