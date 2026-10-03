// Fixture F20. Claims from a model source and from a test source, and nothing else.
import { system, int, unit, and } from "csl";

const EUR = unit("minor", "EUR");

export default system("AccountService", (s) => {
  const Outcome = s.enum("Outcome", ["Accepted", "Rejected"]);
  const Account = s.state("Account", { balance: int(EUR), floor: int(EUR) });
  const Withdraw = s.event("Withdraw", { on: Account, args: { amount: int(EUR) }, returns: Outcome });

  const LedgerModel = s.source("LedgerModel", { kind: "Model", at: "spec/account.csl.ts" });
  const UnitTests = s.source("UnitTests", { kind: "Tests", at: "test/account.test.ts" });

  s.claims(LedgerModel, (c) => {
    c.invariant("MinimumBalance", Account.balance.gte(Account.floor));
  });

  s.claims(UnitTests, (c) => {
    c.example("AcceptsWithdrawal", {
      given: { balance: EUR(5000), floor: EUR(0) },
      when: Withdraw({ amount: EUR(10000) }),
      then: ({ post, result }) =>
        and(
          result.eq(Outcome.Accepted),
          post.balance.eq(EUR(-5000)),
          post.floor.eq(EUR(0)),
        ),
    });
  });
});
