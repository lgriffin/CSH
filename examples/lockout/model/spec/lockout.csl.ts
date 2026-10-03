// The lockout example with its model (docs/lockout-walkthrough.md, section 8). The walkthrough copies this over
// the countermeasures and checks again. The transition states the behaviour all three practices now agree on,
// so the solver can check each rule against it, and the invariant names a rule the code kept implicit.
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

  // The model: what a sign-in does to the state. Agreed after the countermeasures, so it is the fourth voice.
  s.transition(SignIn, ({ pre, post, args, result }) => ({
    when: and(pre.locked.not(), args.passwordOk),
    then: and(
      result.eq(Outcome.Accepted),
      post.failures.eq(Attempts(0)),
      post.locked.eq(pre.locked),
      post.lockSeconds.eq(pre.lockSeconds),
    ),
    otherwise: and(
      result.eq(Outcome.Refused),
      pre.locked.implies(and(post.failures.eq(pre.failures), post.locked, post.lockSeconds.eq(pre.lockSeconds))),
      pre.locked.not().implies(and(
        post.failures.eq(pre.failures.plus(Attempts(1))),
        post.locked.eq(pre.failures.gte(Attempts(2))),
        pre.failures.gte(Attempts(2)).implies(post.lockSeconds.eq(Seconds(900))),
        pre.failures.lt(Attempts(2)).implies(post.lockSeconds.eq(Seconds(0))),
      )),
    ),
  }));

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

    // Implicit in the code (a lock always comes with its duration) until the model needed it said.
    i.invariant("LockHasDuration", Login.locked.implies(Login.lockSeconds.eq(Seconds(900))));

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
