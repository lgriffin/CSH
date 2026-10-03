// Fixture F75. A silent weakening.
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
  s.intent("ProtectFunds", {
    owner: "FinanceDomainOwner",
    value: "Prevent withdrawals below the approved account floor",
    assurance: "FundsSafety",
  }, (i) => {
    i.invariant("MinimumBalance", Account.balance.gte(Account.floor.minus(EUR(500))));
  });

  s.bind(Account.balance, "balanceMinor");
  s.bind(Account.floor, "minimumBalanceMinor");
});
