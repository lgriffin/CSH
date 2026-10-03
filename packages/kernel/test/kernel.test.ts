import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  CanonicalError,
  checkBool,
  digestJson,
  emptyModule,
  evaluate,
  EvalError,
  type Expr,
  fragmentsOf,
  mapValuation,
  type Module,
  moduleDigest,
  typeExpr,
  validateModule,
  type Value,
  type Vocabulary,
} from "@csh/kernel";

const EUR = "minor(EUR)";
// Computed once on Linux x64; any platform must reproduce it.
const PINNED = "sha256:e8a515a66ee7988d6f57af505ccbcf0b5aebd6f74ae47b2665ddf0dfc6d5b33d";
const vocab: Vocabulary = {
  units: [{ id: EUR, dimension: "minor", symbol: "EUR" }],
  enums: [{ name: "Outcome", members: ["Accepted", "Rejected"] }],
  states: [{ name: "Account", fields: { balance: { kind: "int", unit: EUR }, floor: { kind: "int", unit: EUR }, open: { kind: "bool" } } }],
  events: [{ name: "Withdraw", on: "Account", args: { amount: { kind: "int", unit: EUR } }, returns: { kind: "enum", enum: "Outcome" } }],
};

function account(): Module {
  const m = emptyModule("AccountService");
  m.vocabulary = structuredClone(vocab);
  m.policies = [{ name: "P", require: ["SolverCheck"], reject: [] }];
  m.intents = [
    {
      name: "ProtectFunds",
      owner: "Owner",
      value: "v",
      assurance: "P",
      assumptions: [],
      obligations: [{ kind: "invariant", name: "MinimumBalance", state: "Account", body: { k: "ge", l: { k: "field", state: "Account", field: "balance", at: "now" }, r: { k: "field", state: "Account", field: "floor", at: "now" } } }],
      examples: [],
    },
  ];
  return m;
}

describe("canonical JSON and digests", () => {
  it("sorts keys by code point, writes integers as strings and drops undefined", () => {
    expect(canonicalJson({ b: 1, a: [true, null], "é": "x", Z: undefined })).toBe('{"a":[true,null],"b":"1","é":"x"}');
  });

  it("refuses non-integer numbers: the model has no reals", () => {
    expect(() => canonicalJson({ x: 1.5 })).toThrow(CanonicalError);
  });

  it("gives the same digest whatever order keys were inserted in (digest stability)", () => {
    fc.assert(
      fc.property(fc.dictionary(fc.string(), fc.oneof(fc.integer(), fc.string(), fc.boolean())), (obj) => {
        const reversed = Object.fromEntries(Object.entries(obj).reverse());
        expect(digestJson(reversed)).toBe(digestJson(obj));
      }),
    );
  });

  it("pins the digest of a fixed model, so that a platform difference shows up as a failure", () => {
    expect(moduleDigest(account())).toBe(moduleDigest(JSON.parse(JSON.stringify(account())) as Module));
    expect(moduleDigest(account())).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(moduleDigest(account())).toBe(PINNED);
  });

  it("changes a fragment's digest when a field it references changes unit (Semantic contract, section 5, rule 4)", () => {
    const a = account();
    const b = account();
    b.vocabulary.units.push({ id: "minor(USD)", dimension: "minor", symbol: "USD" });
    b.vocabulary.states[0]!.fields.balance = { kind: "int", unit: "minor(USD)" };
    const da = fragmentsOf(a).find((f) => f.local === "MinimumBalance")!.digest;
    const db = fragmentsOf(b).find((f) => f.local === "MinimumBalance")!.digest;
    expect(da).not.toBe(db);
  });

  it("keeps a fragment's digest when an unrelated declaration changes", () => {
    const a = account();
    const b = account();
    b.vocabulary.events[0]!.args.note = { kind: "bool" };
    expect(fragmentsOf(a).find((f) => f.local === "MinimumBalance")!.digest).toBe(fragmentsOf(b).find((f) => f.local === "MinimumBalance")!.digest);
  });
});

// ------------------------------------------------------------------ typing soundness

const field = (f: string, at: "pre" | "post" = "pre"): Expr => ({ k: "field", state: "Account", field: f, at });
const intExpr: fc.Arbitrary<Expr> = fc.letrec<{ i: Expr }>((tie) => ({
  i: fc.oneof(
    { depthSize: "small", withCrossShrink: true },
    fc.bigInt({ min: -(10n ** 30n), max: 10n ** 30n }).map((v): Expr => ({ k: "int", v: v.toString(), unit: EUR })),
    fc.constantFrom(field("balance"), field("floor"), field("balance", "post"), { k: "arg", event: "Withdraw", name: "amount" } as Expr),
    fc.tuple(fc.constantFrom("add" as const, "sub" as const), tie("i"), tie("i")).map(([k, l, r]): Expr => ({ k, l, r })),
  ),
})).i;
const boolExpr: fc.Arbitrary<Expr> = fc.letrec<{ b: Expr }>((tie) => ({
  b: fc.oneof(
    { depthSize: "small", withCrossShrink: true },
    fc.tuple(fc.constantFrom("lt" as const, "le" as const, "gt" as const, "ge" as const, "eq" as const, "ne" as const), intExpr, intExpr).map(([k, l, r]): Expr => ({ k, l, r })),
    fc.constant<Expr>({ k: "eq", l: { k: "result", event: "Withdraw" }, r: { k: "enum", enum: "Outcome", member: "Accepted" } }),
    fc.constant<Expr>(field("open")),
    tie("b").map((x): Expr => ({ k: "not", x })),
    fc.tuple(fc.constantFrom("and" as const, "or" as const), fc.array(tie("b"), { minLength: 1, maxLength: 3 })).map(([k, xs]): Expr => ({ k, xs })),
    fc.tuple(tie("b"), tie("b")).map(([l, r]): Expr => ({ k: "implies", l, r })),
  ),
})).b;

const values = fc.record({
  balance: fc.bigInt({ min: -(10n ** 25n), max: 10n ** 25n }),
  floor: fc.bigInt({ min: -(10n ** 25n), max: 10n ** 25n }),
  post: fc.bigInt({ min: -(10n ** 25n), max: 10n ** 25n }),
  amount: fc.bigInt({ min: -(10n ** 25n), max: 10n ** 25n }),
  open: fc.boolean(),
  result: fc.constantFrom("Accepted", "Rejected"),
});

function valuation(v: { balance: bigint; floor: bigint; post: bigint; amount: bigint; open: boolean; result: string }) {
  const m = new Map<string, Value>([
    ["Account.balance@pre", v.balance],
    ["Account.floor@pre", v.floor],
    ["Account.balance@post", v.post],
    ["Account.open@pre", v.open],
    ["Withdraw.args.amount", v.amount],
    ["Withdraw.result", { enum: "Outcome", member: v.result }],
  ]);
  return mapValuation(m);
}

const stepCtx = { vocabulary: vocab, position: "step", event: "Withdraw" } as const;

describe("typing soundness", () => {
  it("well-typed expressions type as bool and evaluate without a type error", () => {
    fc.assert(
      fc.property(boolExpr, values, (e, v) => {
        expect(checkBool(e, stepCtx as never)).toEqual([]);
        const r = evaluate(e, valuation(v));
        expect(typeof r).toBe("boolean");
      }),
      { numRuns: 300 },
    );
  });

  it("rejects a comparison across units, and never converts", () => {
    const e: Expr = { k: "ge", l: field("balance"), r: { k: "int", v: "0", unit: "minor(USD)" } };
    const errs = checkBool(e, { ...stepCtx, vocabulary: { ...vocab, units: [...vocab.units, { id: "minor(USD)", dimension: "minor", symbol: "USD" }] } } as never);
    expect(errs.map((x) => x.code)).toContain("unit-mismatch");
  });

  it("rejects a raw JavaScript value where an expression belongs (S6)", () => {
    expect(typeExpr(true, stepCtx as never).errors.map((x) => x.code)).toContain("raw-value");
  });

  it("evaluates with unbounded integers", () => {
    const big = "123456789012345678901234567890";
    const e: Expr = { k: "eq", l: { k: "add", l: { k: "int", v: big }, r: { k: "int", v: "1" } }, r: { k: "int", v: "123456789012345678901234567891" } };
    expect(evaluate(e, mapValuation(new Map()))).toBe(true);
  });

  it("reports a missing value rather than guessing one", () => {
    expect(() => evaluate(field("balance"), mapValuation(new Map()))).toThrow(EvalError);
  });
});

describe("rules on the model", () => {
  const rules = (m: Module) => validateModule(m).map((v) => v.rule);

  it("accepts a well-formed model", () => {
    expect(validateModule(account())).toEqual([]);
  });

  it("S4: an intent needs an owner", () => {
    const m = account();
    m.intents[0]!.owner = "";
    expect(rules(m)).toContain("S4");
  });

  it("S5: a binding may not target an enumeration", () => {
    const m = account();
    m.bindings.push({ target: { k: "field", state: "Outcome", field: "x" }, key: "outcome" });
    expect(rules(m)).toContain("S5");
  });

  it("S8: a policy may not name an undefined method", () => {
    const m = account();
    m.policies[0]!.require = ["PeerReview" as never];
    expect(rules(m)).toContain("S8");
  });

  it("S3: an invariant may not read the post-state", () => {
    const m = account();
    (m.intents[0]!.obligations[0] as { body: Expr }).body = { k: "ge", l: field("balance", "post"), r: { k: "int", v: "0", unit: EUR } };
    expect(rules(m)).toContain("S3");
  });
});
