// Fixture F51. a cited sentence is reworded.
// Generated from fixtures/base/account.csl.ts; see README.md.
// The account specification of the main tab, section 7.2. Every fixture starts from this.
import { system, int, unit, and } from "csl";

const EUR = unit("minor", "EUR");

export default system("AccountService", (s) => {
  const Outcome = s.enum("Outcome", ["Accepted", "Rejected"]);

  const Account = s.state("Account", {
    balance: int(EUR),
    floor: int(EUR),
  });

  const Withdraw = s.event("Withdraw", {
    on: Account,
    args: { amount: int(EUR) },
    returns: Outcome,
  });

  // The formal model: what a withdrawal does to the state.
  s.transition(Withdraw, ({ pre, post, args, result }) => ({
    when: pre.balance.minus(args.amount).gte(pre.floor),
    then: and(
      result.eq(Outcome.Accepted),
      post.balance.eq(pre.balance.minus(args.amount)),
      post.floor.eq(pre.floor),
    ),
    otherwise: and(
      result.eq(Outcome.Rejected),
      post.balance.eq(pre.balance),
      post.floor.eq(pre.floor),
    ),
  }));

  s.policy("FundsSafety", {
    require: ["ApprovedBinding", "BoundaryWitness", "SolverCheck"],
    reject: ["MockOnly"],
  });

  const Requirements = s.source("Requirements", { kind: "Requirements", at: "inputs/requirements.md" });

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
      cites: [{ source: Requirements, id: "ACC-007" }],
    });

    i.example("RejectAtBoundary", {
      given: { balance: EUR(5000), floor: EUR(0) },
      when: Withdraw({ amount: EUR(10000) }),
      then: ({ post, result }) =>
        and(result.eq(Outcome.Rejected), post.balance.eq(EUR(5000))),
    });
  });

  s.bind(Account.balance, "balanceMinor");
  s.bind(Account.floor, "minimumBalanceMinor");
});
