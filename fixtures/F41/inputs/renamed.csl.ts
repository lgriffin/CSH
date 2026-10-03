// Fixture F41, second step: a local constant renamed.
import { system, int, unit, and } from "csl";

const Euro = unit("minor", "EUR");

export default system("AccountService", (s) => {
  const Outcome = s.enum("Outcome", ["Accepted", "Rejected"]);

  const Account = s.state("Account", {
    balance: int(Euro),
    floor: int(Euro),
  });

  const Withdraw = s.event("Withdraw", {
    on: Account,
    args: { amount: int(Euro) },
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

  s.intent("ProtectFunds", {
    owner: "FinanceDomainOwner",
    value: "Prevent withdrawals below the approved account floor",
    assurance: "FundsSafety",
  }, (i) => {
    i.assume("PositiveAmount", Withdraw.args.amount.gt(Euro(0)));

    i.invariant("MinimumBalance", Account.balance.gte(Account.floor));

    i.requirement("RejectInsufficientFunds", {
      when: Withdraw,
      and: ({ pre, args }) => pre.balance.minus(args.amount).lt(pre.floor),
      shall: ({ result }) => result.eq(Outcome.Rejected),
      ensures: ({ pre, post }) => post.balance.eq(pre.balance),
    });

    i.example("RejectAtBoundary", {
      given: { balance: Euro(5000), floor: Euro(0) },
      when: Withdraw({ amount: Euro(10000) }),
      then: ({ post, result }) =>
        and(result.eq(Outcome.Rejected), post.balance.eq(Euro(5000))),
    });
  });

  s.source("UnitTests", { kind: "Witnesses", at: "inputs/witnesses.ndjson" });

  s.bind(Account.balance, "balanceMinor");
  s.bind(Account.floor, "minimumBalanceMinor");
  s.bind(Withdraw.args.amount, "amount");
  s.bind(Withdraw.result, "result");
});
