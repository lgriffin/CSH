import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { emit } from "@csh/emit";
import { emptyModule, type Expr, type Module, moduleDigest, validateModule } from "@csh/kernel";
import { printModule } from "@csh/print";

const repo = resolve(import.meta.dirname, "..", "..", "..");
const work = join(repo, ".csh-cache", "print-test");
mkdirSync(work, { recursive: true });

async function reemit(m: Module, name: string): Promise<string> {
  const file = join(work, `${name}.csl.ts`);
  writeFileSync(file, printModule(m));
  const r = await emit(file, { root: work });
  if (!r.ok) throw new Error(`printed model does not emit: ${JSON.stringify(r.errors)}\n${printModule(m)}`);
  return r.digest;
}

// Random models over one state, one event and a few obligations.
const U = "minor(EUR)";
const fieldNames = ["alpha", "beta", "gamma"] as const;
const lit = fc.bigInt({ min: -(10n ** 18n), max: 10n ** 18n }).map((v): Expr => ({ k: "int", v: v.toString(), unit: U }));
const now = (f: string): Expr => ({ k: "field", state: "Store", field: f, at: "now" });
const cmp = fc.constantFrom("lt" as const, "le" as const, "gt" as const, "ge" as const, "eq" as const, "ne" as const);
const invBody: fc.Arbitrary<Expr> = fc.oneof(
  fc.tuple(cmp, fc.constantFrom(...fieldNames), lit).map(([k, f, r]): Expr => ({ k, l: now(f), r })),
  fc.tuple(cmp, fc.constantFrom(...fieldNames), fc.constantFrom(...fieldNames)).map(([k, f, g]): Expr => ({ k, l: { k: "add", l: now(f), r: { k: "int", v: "1", unit: U } }, r: now(g) })),
  fc.tuple(fc.constantFrom("alpha" as const), lit, lit).map(([f, a, b]): Expr => ({ k: "or", xs: [{ k: "ge", l: now(f), r: a }, { k: "le", l: now(f), r: b }, { k: "eq", l: now(f), r: a }] })),
);
const model = fc.record({ invs: fc.array(invBody, { minLength: 1, maxLength: 3 }), lim: lit, ens: fc.boolean() }).map(({ invs, lim, ens }): Module => {
  const m = emptyModule("RandomSystem");
  m.vocabulary = {
    units: [{ id: U, dimension: "minor", symbol: "EUR" }],
    enums: [{ name: "Result", members: ["Done", "Refused"] }],
    states: [{ name: "Store", fields: { alpha: { kind: "int", unit: U }, beta: { kind: "int", unit: U }, gamma: { kind: "int", unit: U }, open: { kind: "bool" } } }],
    events: [{ name: "Take", on: "Store", args: { qty: { kind: "int", unit: U } }, returns: { kind: "enum", enum: "Result" } }],
  };
  m.policies = [{ name: "Policy", require: ["SolverCheck"], reject: ["MockOnly"], critical: true }];
  const pre = (f: string): Expr => ({ k: "field", state: "Store", field: f, at: "pre" });
  const post = (f: string): Expr => ({ k: "field", state: "Store", field: f, at: "post" });
  m.intents = [{
    name: "Keep",
    owner: "Owner",
    value: "random",
    assurance: "Policy",
    assumptions: [{ name: "Positive", body: { k: "gt", l: { k: "arg", event: "Take", name: "qty" }, r: { k: "int", v: "0", unit: U } } }],
    obligations: [
      ...invs.map((body, i) => ({ kind: "invariant" as const, name: `Inv${i}`, state: "Store", body })),
      { kind: "requirement" as const, name: "Limit", event: "Take", while: { k: "field", state: "Store", field: "open", at: "pre" }, and: { k: "gt", l: { k: "arg", event: "Take", name: "qty" }, r: lim }, shall: { k: "eq", l: { k: "result", event: "Take" }, r: { k: "enum", enum: "Result", member: "Refused" } }, ensures: ens ? [{ k: "eq", l: post("alpha"), r: pre("alpha") }] : [] },
    ],
    examples: [{ name: "Small", event: "Take", given: { alpha: { k: "int", v: "5", unit: U } }, args: { qty: { k: "int", v: "1", unit: U } }, then: { k: "not", x: { k: "eq", l: { k: "result", event: "Take" }, r: { k: "enum", enum: "Result", member: "Refused" } } } }],
  }];
  m.transitions = [{ event: "Take", when: { k: "ge", l: pre("alpha"), r: { k: "arg", event: "Take", name: "qty" } }, then: { k: "eq", l: post("alpha"), r: { k: "sub", l: pre("alpha"), r: { k: "arg", event: "Take", name: "qty" } } } }];
  m.bindings = [{ target: { k: "field", state: "Store", field: "alpha" }, key: "alpha" }];
  return m;
});

describe("printer round trip", () => {
  it("emitting printed text reproduces the digest, on random models", async () => {
    let n = 0;
    await fc.assert(
      fc.asyncProperty(model, async (m) => {
        expect(validateModule(m)).toEqual([]);
        expect(await reemit(m, `random-${n++}`)).toBe(moduleDigest(m));
      }),
      { numRuns: 8 },
    );
  });

  it("emitting printed text reproduces the digest for every fixture model that emits without packs", async () => {
    const fixtures = join(repo, "fixtures");
    const seen = new Set<string>();
    let checked = 0;
    for (const id of readdirSync(fixtures).filter((d) => /^F\d{2,3}$/.test(d))) {
      const spec = join(fixtures, id, "spec.csl.ts");
      const exp = JSON.parse(readFileSync(join(fixtures, id, "expected.json"), "utf8")).expect;
      if (exp.compile?.ok === false || exp.emit?.ok === false || existsSync(join(fixtures, id, "inputs", "lock.json"))) continue;
      const r = await emit(spec, { root: join(fixtures, id), readable: [fixtures], skipTypeCheck: true });
      if (!r.ok || seen.has(r.digest)) continue;
      seen.add(r.digest);
      expect(await reemit(r.module, `fixture-${id}`), id).toBe(r.digest);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(10);
  });


});

describe("printer round trip on awkward names", () => {
  it("keeps unit ids that differ only in punctuation, and enum members that are not identifiers", async () => {
    const m = emptyModule("Awkward");
    m.vocabulary = {
      units: [{ id: "a-b(c)", dimension: "a-b", symbol: "c" }, { id: "a_b(c)", dimension: "a_b", symbol: "c" }],
      enums: [{ name: "Mode", members: ["not-valid", "ok"] }],
      states: [{ name: "Box", fields: { x: { kind: "int", unit: "a-b(c)" }, y: { kind: "int", unit: "a_b(c)" }, mode: { kind: "enum", enum: "Mode" } } }],
      events: [],
    };
    m.policies = [{ name: "Policy", require: ["SolverCheck"], reject: [] }];
    m.intents = [{
      name: "Keep",
      owner: "Owner",
      value: "awkward names",
      assurance: "Policy",
      assumptions: [],
      obligations: [
        { kind: "invariant", name: "X", state: "Box", body: { k: "ge", l: { k: "field", state: "Box", field: "x", at: "now" }, r: { k: "int", v: "0", unit: "a-b(c)" } } },
        { kind: "invariant", name: "M", state: "Box", body: { k: "ne", l: { k: "field", state: "Box", field: "mode", at: "now" }, r: { k: "enum", enum: "Mode", member: "not-valid" } } },
      ],
      examples: [],
    }] as unknown as Module["intents"];
    expect(validateModule(m)).toEqual([]);
    expect(await reemit(m, "awkward")).toBe(moduleDigest(m));
  });
});
