// Fixture F76. An explicit, owned relaxation.
// A profile: the funds-safety pack composed with local transitions, bindings and obligations.
import { system, int, unit, and } from "csl";
import funds from "../packs/funds-safety.pack.ts";

const EUR = unit("minor", "EUR");

export default system("AccountService", (s) => {
  // Declared before the pack is used, so that the profile has handles; the pack merges in
  // only where types and units agree.
  const Outcome = s.enum("Outcome", ["Accepted", "Rejected"]);
  const Account = s.state("Account", { balance: int(EUR), floor: int(EUR) });
  const Withdraw = s.event("Withdraw", { on: Account, args: { amount: int(EUR) }, returns: Outcome });
  s.use(funds);

  s.transition(Withdraw, ({ pre, post, args, result }) => ({
    when: pre.balance.minus(args.amount).gte(pre.floor),
    then: and(result.eq(Outcome.Accepted), post.balance.eq(pre.balance.minus(args.amount)), post.floor.eq(pre.floor)),
    otherwise: and(result.eq(Outcome.Rejected), post.balance.eq(pre.balance), post.floor.eq(pre.floor)),
  }));
  s.relax("AccountService/ProtectFunds/MinimumBalance", {
    owner: "FinanceDomainOwner",
    reason: "Overdraft accounts may go up to 500 below the floor",
  });
  s.intent("Overdraft", {
    owner: "FinanceDomainOwner",
    value: "Bound how far an overdraft account may go below its floor",
    assurance: "FundsSafety",
  }, (i) => {
    i.invariant("OverdraftLimit", Account.balance.gte(Account.floor.minus(EUR(500))));
  });

  s.bind(Account.balance, "balanceMinor");
  s.bind(Account.floor, "minimumBalanceMinor");
});
