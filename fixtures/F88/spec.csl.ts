// F88: as F87, but the second example leaves locked unstated, so the inputs only overlap.
import { system, int, bool, unit, truth } from "csl";

const Attempts = unit("count", "attempts");

export default system("SignInService", (s) => {
  const Outcome = s.enum("Outcome", ["Accepted", "Refused"]);

  const Login = s.state("Login", {
    failures: int(Attempts),
    locked: bool(),
  });

  const SignIn = s.event("SignIn", {
    on: Login,
    args: { passwordOk: bool() },
    returns: Outcome,
  });

  const Scenarios = s.source("Scenarios", { kind: "Scenarios", at: "inputs/none" });
  const Second = s.source("UnitTests", { kind: "Witnesses", at: "inputs/none" });

  // No requirement: nothing sits between the two examples.
  s.claims(Scenarios, (c) => {
    c.example("ThirdFailureLocks", {
      given: { failures: Attempts(2), locked: truth(false) },
      when: SignIn({ passwordOk: truth(false) }),
      then: ({ post, result }) => post.locked.and(result.eq(Outcome.Refused)),
    });
  });

  s.claims(Second, (c) => {
    c.example("ThirdFailureAllowed", {
      given: { failures: Attempts(2) },
      when: SignIn({ passwordOk: truth(false) }),
      then: ({ post, result }) => post.locked.not().and(result.eq(Outcome.Refused)),
    });
  });
});
