// Compile-time rules S1 to S5 of the csl package (Language reference, section 6). Each
// line under an expect-error directive must fail to compile; if it ever compiles, TypeScript
// reports the directive as unused (TS2578) and static-rules.test.ts fails.
import { system, int, unit, and, type Int } from "csl";

const EUR = unit("minor", "EUR");
const USD = unit("minor", "USD");

export default system("StaticRules", (s) => {
  const Outcome = s.enum("Outcome", ["Accepted", "Rejected"]);
  const Account = s.state("Account", { balance: int(EUR), floor: int(EUR) });
  const Withdraw = s.event("Withdraw", { on: Account, args: { amount: int(EUR) }, returns: Outcome });
  s.policy("P", { require: ["SolverCheck"], reject: [] });

  let post: Int<"minor(EUR)", "post"> | undefined;
  s.transition(Withdraw, ({ pre, post: p, args, result }) => {
    post = p.balance;
    return { when: pre.balance.gte(args.amount), then: and(result.eq(Outcome.Accepted), p.floor.eq(pre.floor)) };
  });

  s.intent("Rules", { owner: "O", value: "v", assurance: "P" }, (i) => {
    // S1: a term the vocabulary does not declare.
    // @ts-expect-error S1
    i.invariant("Misspelt", Account.balence.gte(Account.floor));

    // S2: a comparison across units.
    // @ts-expect-error S2
    i.invariant("WrongUnit", Account.balance.gte(USD(0)));

    // S2: arithmetic across units.
    // @ts-expect-error S2
    i.invariant("WrongSum", Account.balance.plus(USD(1)).gte(Account.floor));

    // S3: an invariant reads the post-state.
    // @ts-expect-error S3
    i.invariant("Phase", post!.gte(Account.floor));

    // S3: a requirement's while clause reads an argument.
    i.requirement("WhileArg", {
      when: Withdraw,
      // @ts-expect-error S3
      while: ({ args }) => args.amount.gt(EUR(0)),
      shall: ({ result }) => result.eq(Outcome.Rejected),
    });
  });

  // S4: an intent with no owner.
  // @ts-expect-error S4
  s.intent("NoOwner", { value: "v", assurance: "P" }, () => undefined);

  // S5: a binding to something that is not a field, argument or result.
  // @ts-expect-error S5
  s.bind(Outcome, "outcome");

  // S5: a binding to a literal.
  // @ts-expect-error S5
  s.bind(EUR(5), "five");
});
