import { describe, expect, it } from "vitest";
import { compositionOf, definePack, int, isModule, system, unit, and } from "csl";
import { validateModule } from "@csh/kernel";

const EUR = unit("minor", "EUR");

function account(name = "AccountService", unitFn = EUR) {
  return system(name, (s) => {
    const Outcome = s.enum("Outcome", ["Accepted", "Rejected"]);
    const Account = s.state("Account", { balance: int(unitFn), floor: int(unitFn) });
    const Withdraw = s.event("Withdraw", { on: Account, args: { amount: int(unitFn) }, returns: Outcome });
    s.transition(Withdraw, ({ pre, post, args, result }) => ({
      when: pre.balance.minus(args.amount).gte(pre.floor),
      then: and(result.eq(Outcome.Accepted), post.balance.eq(pre.balance.minus(args.amount))),
    }));
    s.policy("P", { require: ["SolverCheck"], reject: [] });
    s.intent("ProtectFunds", { owner: "O", value: "v", assurance: "P" }, (i) => {
      i.invariant("MinimumBalance", Account.balance.gte(Account.floor));
    });
    s.bind(Account.balance, "balanceMinor");
  });
}

describe("the builder", () => {
  it("emits plain IR data that passes every rule", () => {
    const m = account();
    expect(isModule(m)).toBe(true);
    expect(validateModule(m)).toEqual([]);
    expect(m.vocabulary.units).toEqual([{ id: "minor(EUR)", dimension: "minor", symbol: "EUR" }]);
    expect(m.intents[0]!.obligations[0]).toEqual({
      kind: "invariant",
      name: "MinimumBalance",
      state: "Account",
      body: { k: "ge", l: { k: "field", state: "Account", field: "balance", at: "now" }, r: { k: "field", state: "Account", field: "floor", at: "now" } },
    });
    expect(m.bindings).toEqual([{ target: { k: "field", state: "Account", field: "balance" }, key: "balanceMinor" }]);
  });

  it("writes literals as decimal strings and refuses unsafe JavaScript numbers", () => {
    expect((EUR(5) as unknown as { expr: unknown }).expr).toEqual({ k: "int", v: "5", unit: "minor(EUR)" });
    expect((EUR(10n ** 30n) as unknown as { expr: unknown }).expr).toEqual({ k: "int", v: (10n ** 30n).toString(), unit: "minor(EUR)" });
    expect(() => EUR(2 ** 60)).toThrow(/E-INT/);
  });

  it("marks a raw JavaScript value so that the IR check reports S6", () => {
    const m = system("Raw", (s) => {
      const A = s.state("A", { x: int(EUR) });
      s.policy("P", { require: ["SolverCheck"], reject: [] });
      s.intent("I", { owner: "O", value: "v", assurance: "P" }, (i) => {
        i.invariant("Raw", true as never);
        void A;
      });
    });
    expect(validateModule(m).map((v) => v.rule)).toContain("S6");
  });
});

describe("composition", () => {
  const pack = definePack(account("FundsSafety"), "1.0.0");

  it("gives a pack a stable digest of its emitted model", () => {
    expect(definePack(account("FundsSafety"), "1.0.0").digest).toBe(pack.digest);
    expect(pack.digest).toMatch(/^sha256:/);
  });

  it("records the pinned use and the inherited obligations", () => {
    const m = system("Profile", (s) => {
      s.use(pack);
    });
    expect(m.uses).toEqual([{ pack: "FundsSafety", version: "1.0.0", digest: pack.digest }]);
    expect(compositionOf(m)?.inherited).toEqual([{ name: "Profile/ProtectFunds/MinimumBalance", pack: "FundsSafety" }]);
  });

  it("refuses to merge vocabulary whose units disagree (E-VOCAB)", () => {
    const USD = unit("minor", "USD");
    const m = system("Profile", (s) => {
      s.state("Account", { balance: int(USD), floor: int(USD) });
      s.use(pack);
    });
    expect(compositionOf(m)?.errors.map((e) => e.code)).toContain("E-VOCAB");
  });

  it("records a replaced obligation for the refinement check, and an explicit relaxation", () => {
    const m = system("Profile", (s) => {
      const Account = s.state("Account", { balance: int(EUR), floor: int(EUR) });
      s.use(pack);
      s.intent("ProtectFunds", { owner: "O", value: "v", assurance: "P" }, (i) => {
        i.invariant("MinimumBalance", Account.balance.gte(Account.floor.plus(EUR(1))));
      });
    });
    expect(compositionOf(m)?.shadowed.map((x) => x.name)).toEqual(["MinimumBalance"]);
    const relaxed = system("Profile", (s) => {
      s.use(pack);
      s.relax("Profile/ProtectFunds/MinimumBalance", { owner: "O", reason: "overdraft" });
    });
    expect(relaxed.relaxations).toEqual([{ obligation: "Profile/ProtectFunds/MinimumBalance", owner: "O", reason: "overdraft" }]);
    expect(relaxed.intents[0]!.obligations).toEqual([]);
  });

  it("refuses to relax something that was not inherited", () => {
    const m = system("Profile", (s) => {
      s.relax("Profile/Nothing/Here", { owner: "O", reason: "r" });
    });
    expect(compositionOf(m)?.errors.map((e) => e.code)).toContain("E-COMPOSE");
  });
});

describe("deterministic events", () => {
  const withEvent = (deterministic?: unknown) =>
    system("D", (s) => {
      const A = s.state("A", { x: int(EUR) });
      s.event("E", { on: A, args: {}, ...(deterministic !== undefined ? { deterministic: deterministic as boolean } : {}) });
    });

  it("records deterministic only when it is true", () => {
    expect(withEvent(true).vocabulary.events[0]!.deterministic).toBe(true);
    expect("deterministic" in withEvent(false).vocabulary.events[0]!).toBe(false);
    expect("deterministic" in withEvent().vocabulary.events[0]!).toBe(false);
  });

  it("refuses a value other than true or false", () => {
    expect(() => withEvent("yes")).toThrow(/deterministic/);
  });

  it("is an S1 violation in the IR when present and not true", () => {
    const m = withEvent(true);
    (m.vocabulary.events[0] as { deterministic?: unknown }).deterministic = false;
    expect(validateModule(m).map((v) => v.rule)).toContain("S1");
  });
});
