// The sign-in base with a third source, design notes, that no practice in the component manifest names.
import { system, int, bool, unit, and } from "csl";

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

  const Product = s.source("Product", { kind: "Requirements", at: "inputs/requirements.md" });
  s.source("UnitTests", { kind: "Witnesses", at: "inputs/witnesses.ndjson" });
  s.source("DesignNotes", { kind: "DesignNotes", at: "inputs/notes" });

  s.policy("LockoutSafety", { require: ["ApprovedBinding", "BoundaryWitness", "SolverCheck"] });

  s.intent("StopPasswordGuessing", {
    owner: "SecurityOwner",
    value: "Stop password guessing",
    assurance: "LockoutSafety",
  }, (i) => {
    i.requirement("LockOnThirdFailure", {
      when: SignIn,
      and: ({ pre, args }) => and(args.passwordOk.not(), pre.failures.eq(Attempts(2))),
      shall: ({ result, post }) => and(result.eq(Outcome.Refused), post.locked),
      cites: [{ source: Product, id: "LCK-001" }],
    });
  });

  s.bind(Login.failures, "failedAttempts");
  s.bind(Login.locked, "locked");
  s.bind(SignIn.args.passwordOk, "passwordOk");
  s.bind(SignIn.result, "result");
});
