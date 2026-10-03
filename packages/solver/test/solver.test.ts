import fc from "fast-check";
import { beforeAll, describe, expect, it } from "vitest";
import { evaluateBool, type Expr, mapValuation, type Value, type Vocabulary } from "@csh/kernel";
import { createFakeSolver, createZ3Solver, ex, PRE, qFeas, qState, type QInvariant, satisfiable, type SolverPort } from "@csh/solver";

const vocab: Vocabulary = {
  units: [],
  enums: [{ name: "Outcome", members: ["Accepted", "Rejected"] }],
  states: [{ name: "S", fields: { x: { kind: "int" }, y: { kind: "int" }, b: { kind: "bool" } } }],
  events: [{ name: "E", on: "S", args: { a: { kind: "int" } }, returns: { kind: "enum", enum: "Outcome" } }],
};
const x: Expr = { k: "field", state: "S", field: "x", at: "pre" };
const y: Expr = { k: "field", state: "S", field: "y", at: "pre" };
const a: Expr = { k: "arg", event: "E", name: "a" };
const lit = (v: bigint): Expr => ({ k: "int", v: v.toString() });

const intE: fc.Arbitrary<Expr> = fc.letrec<{ i: Expr }>((tie) => ({
  i: fc.oneof(
    { depthSize: "small" },
    fc.bigInt({ min: -(10n ** 20n), max: 10n ** 20n }).map(lit),
    fc.constantFrom(x, y, a),
    fc.tuple(fc.constantFrom("add" as const, "sub" as const), tie("i"), tie("i")).map(([k, l, r]): Expr => ({ k, l, r })),
  ),
})).i;
const boolE: fc.Arbitrary<Expr> = fc.letrec<{ b: Expr }>((tie) => ({
  b: fc.oneof(
    { depthSize: "small" },
    fc.tuple(fc.constantFrom("lt" as const, "le" as const, "gt" as const, "ge" as const, "eq" as const, "ne" as const), intE, intE).map(([k, l, r]): Expr => ({ k, l, r })),
    fc.constant<Expr>({ k: "field", state: "S", field: "b", at: "pre" }),
    fc.constant<Expr>({ k: "eq", l: { k: "result", event: "E" }, r: { k: "enum", enum: "Outcome", member: "Rejected" } }),
    tie("b").map((e): Expr => ({ k: "not", x: e })),
    fc.tuple(fc.constantFrom("and" as const, "or" as const), fc.array(tie("b"), { minLength: 1, maxLength: 3 })).map(([k, xs]): Expr => ({ k, xs })),
    fc.tuple(tie("b"), tie("b")).map(([l, r]): Expr => ({ k: "implies", l, r })),
  ),
})).b;

let z3: SolverPort;
beforeAll(async () => {
  z3 = await createZ3Solver();
});

describe("evaluator and solver agree", () => {
  it("on random expressions and random concrete values", async () => {
    await fc.assert(
      fc.asyncProperty(boolE, fc.bigInt({ min: -(10n ** 20n), max: 10n ** 20n }), fc.bigInt({ min: -(10n ** 20n), max: 10n ** 20n }), fc.bigInt({ min: -(10n ** 20n), max: 10n ** 20n }), fc.boolean(), fc.constantFrom("Accepted", "Rejected"), async (e, xv, yv, av, bv, rv) => {
        const vals = new Map<string, Value>([["S.x@pre", xv], ["S.y@pre", yv], ["E.args.a", av], ["S.b@pre", bv], ["E.result", { enum: "Outcome", member: rv }]]);
        const expected = evaluateBool(e, mapValuation(vals));
        const fix = [
          ex({ k: "eq", l: x, r: lit(xv) }, PRE),
          ex({ k: "eq", l: y, r: lit(yv) }, PRE),
          ex({ k: "eq", l: a, r: lit(av) }, PRE),
          ex({ k: "eq", l: { k: "field", state: "S", field: "b", at: "pre" }, r: { k: "bool", v: bv } }, PRE),
          ex({ k: "eq", l: { k: "result", event: "E" }, r: { k: "enum", enum: "Outcome", member: rv } }, PRE),
        ];
        const got = await satisfiable({ solver: z3, vocabulary: vocab, budgetMs: 10000 }, [...fix, ex(e, PRE)]);
        expect(got).toBe(expected ? "sat" : "unsat");
      }),
      { numRuns: 60 },
    );
  });
});

describe("minimal conflicting sets", () => {
  it("every reported set is unsatisfiable and every set with one member removed is satisfiable", async () => {
    const env = { solver: z3, vocabulary: vocab, budgetMs: 10000 };
    await fc.assert(
      fc.asyncProperty(fc.array(fc.tuple(fc.constantFrom("ge" as const, "le" as const), fc.constantFrom("x", "y"), fc.integer({ min: -5, max: 5 })), { minLength: 2, maxLength: 6 }), async (cs) => {
        const invs: QInvariant[] = cs.map(([op, f, c], i) => ({ id: `I${i}`, state: "S", body: { k: op, l: { k: "field", state: "S", field: f, at: "now" }, r: lit(BigInt(c)) } }));
        const r = await qState(env, [], invs);
        if (r.status !== "failed") return;
        for (const s of r.sets) {
          const members = invs.filter((i) => s.members.includes(i.id));
          expect((await qState(env, [], members)).status).toBe("failed");
          for (const m of members) expect((await qState(env, [], members.filter((o) => o !== m))).status).toBe("wanted");
        }
      }),
      { numRuns: 25 },
    );
  });
});

describe("no answer is read as a wanted outcome", () => {
  const inv: QInvariant = { id: "I", state: "S", body: { k: "ge", l: { k: "field", state: "S", field: "x", at: "now" }, r: lit(0n) } };
  for (const behaviour of ["crash", "timeout", "unknown", "garbage"] as const) {
    it(`a solver that answers ${behaviour} gives unknown`, async () => {
      const env = { solver: createFakeSolver(behaviour), vocabulary: vocab, budgetMs: 1000 };
      expect((await qState(env, [], [inv])).status).toBe("unknown");
      const req = { id: "R", event: "E", shall: { k: "eq", l: { k: "result", event: "E" }, r: { k: "enum", enum: "Outcome", member: "Rejected" } } as Expr, ensures: [] };
      expect((await qFeas(env, "E", [], [inv], [req])).status).toBe("unknown");
    });
  }

  it("a budget of zero gives unknown with reason solver-timeout", async () => {
    const r = await qState({ solver: z3, vocabulary: vocab, budgetMs: 0 }, [], [inv]);
    expect(r).toEqual({ status: "unknown", reason: "solver-timeout" });
  });
});
