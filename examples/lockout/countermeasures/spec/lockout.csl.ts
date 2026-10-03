// The lockout example after its countermeasures (docs/lockout-walkthrough.md, section 7). The walkthrough
// copies these files over the example and checks again. Only the lines marked as countermeasures changed.
import { system, int, bool, unit, and } from "csl";

const Attempts = unit("count", "attempts");
const Seconds = unit("time", "s");

export default system("SignInService", (s) => {
  const Outcome = s.enum("Outcome", ["Accepted", "Refused"]);

  const Login = s.state("Login", {
    failures: int(Attempts),
    locked: bool(),
    lockSeconds: int(Seconds),
  });

  const SignIn = s.event("SignIn", {
    on: Login,
    args: { passwordOk: bool() },
    returns: Outcome,
  });

  // The three practices, each read by its own adapter.
  const Product = s.source("Product", { kind: "Requirements", at: "docs/requirements.md" });
  s.source("Scenarios", { kind: "Scenarios", at: "features" });
  s.source("UnitTests", { kind: "Witnesses", at: "reports/witnesses.ndjson" });

  s.policy("LockoutSafety", {
    require: ["ApprovedBinding", "BoundaryWitness", "SolverCheck"],
    reject: ["MockOnly"],
  });

  // Each EARS sentence written as a predicate by a person, citing the sentence it claims to express.
  s.intent("StopPasswordGuessing", {
    owner: "SecurityOwner",
    value: "Stop password guessing without locking out the real account holder",
    assurance: "LockoutSafety",
  }, (i) => {
    i.assume("CountNeverNegative", Login.failures.gte(Attempts(0)));

    i.requirement("LockOnThirdFailure", {
      when: SignIn,
      and: ({ pre, args }) => and(args.passwordOk.not(), pre.failures.eq(Attempts(2))),
      shall: ({ result, post }) => and(result.eq(Outcome.Refused), post.locked),
      ensures: ({ post }) => post.lockSeconds.eq(Seconds(900)),
      cites: [{ source: Product, id: "LCK-001" }],
    });

    i.requirement("RefuseWhileLocked", {
      when: SignIn,
      while: ({ pre }) => pre.locked,
      shall: ({ result }) => result.eq(Outcome.Refused),
      cites: [{ source: Product, id: "LCK-002" }],
    });

    // Countermeasure: LCK-003 now carries the context it was missing, so the two sentences no longer overlap.
    i.requirement("AcceptCorrectPassword", {
      when: SignIn,
      while: ({ pre }) => pre.locked.not(),
      and: ({ args }) => args.passwordOk,
      shall: ({ result }) => result.eq(Outcome.Accepted),
      ensures: ({ post }) => post.failures.eq(Attempts(0)),
      cites: [{ source: Product, id: "LCK-003" }],
    });
  });

  // How the test records' keys, and the scenario steps' keys, map to model terms. Candidate until approved.
  s.bind(Login.failures, "failedAttempts");
  s.bind(Login.locked, "locked");
  s.bind(Login.lockSeconds, "lockSeconds");
  s.bind(SignIn.args.passwordOk, "passwordOk");
  s.bind(SignIn.result, "result");
});
