// A reusable pack: the funds-safety vocabulary and obligations, for any system with accounts.
// Profiles import it with s.use() and pin its version and digest in the lock file.
import { system, int, unit, definePack } from "csl";

const EUR = unit("minor", "EUR");

const model = system("FundsSafety", (s) => {
  const Outcome = s.enum("Outcome", ["Accepted", "Rejected"]);
  const Account = s.state("Account", { balance: int(EUR), floor: int(EUR) });
  const Withdraw = s.event("Withdraw", { on: Account, args: { amount: int(EUR) }, returns: Outcome });

  s.policy("FundsSafety", {
    require: ["ApprovedBinding", "BoundaryWitness", "SolverCheck"],
    reject: ["MockOnly"],
  });

  s.intent("ProtectFunds", {
    owner: "FinanceDomainOwner",
    value: "Prevent withdrawals below the approved account floor",
    assurance: "FundsSafety",
  }, (i) => {
    i.assume("PositiveAmount", Withdraw.args.amount.gt(EUR(0)));
    i.invariant("MinimumBalance", Account.balance.gte(Account.floor));
    i.requirement("RejectInsufficientFunds", {
      when: Withdraw,
      and: ({ pre, args }) => pre.balance.minus(args.amount).lt(pre.floor),
      shall: ({ result }) => result.eq(Outcome.Rejected),
      ensures: ({ pre, post }) => post.balance.eq(pre.balance),
    });
  });
});

export default definePack(model, "1.0.0");
