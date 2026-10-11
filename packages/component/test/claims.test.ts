// Proposed claims (stage 24): kept in csh/claims.json, joined into the model's intents as candidates.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Module } from "@csh/kernel";
import { CLAIMS_PATH, type ProposedClaim, proposeClaim, readClaims, withProposedClaims } from "../src/index.ts";

const model: Module = {
  schema: "csh-ir/v1",
  system: "S",
  uses: [],
  vocabulary: { units: [], enums: [], states: [], events: [] },
  transitions: [],
  policies: [],
  intents: [{ name: "Errors", owner: "O", value: "V", assurance: "A", obligations: [{ kind: "architecture", name: "Taken", native: null }], examples: [], assumptions: [] }],
  sources: [],
  claims: [],
  bindings: [],
} as unknown as Module;
const proposal = (name: string, intent = "Errors"): ProposedClaim => ({ name, intent, claim: { k: "claim", holds: false, p: { k: "exports", module: "src/errors.ts", symbol: "isOpen" } }, cites: [{ source: "Guides", id: "E-1" }], why: "the guide says it is not public" });

describe("proposed claims", () => {
  it("join their intent as architecture obligations, refusing an unknown intent and a taken name", () => {
    const r = withProposedClaims(model, [proposal("NotPublic"), proposal("Taken"), proposal("Lost", "Nowhere")]);
    expect(r.errors.map((e) => e.code)).toEqual(["claims-duplicate", "claims-unknown-intent"]);
    expect(r.module.intents[0]!.obligations.map((o) => o.name)).toEqual(["Taken", "NotPublic"]);
    expect(r.module.intents[0]!.obligations[1]).toMatchObject({ kind: "architecture", native: { k: "claim", holds: false }, cites: [{ source: "Guides", id: "E-1" }] });
    expect(model.intents[0]!.obligations).toHaveLength(1);
    expect(withProposedClaims(model, []).module).toBe(model);
  });

  it("are written by proposeClaim and read back, and a malformed file is a problem, not an empty list", () => {
    const root = mkdtempSync(join(tmpdir(), "claims-"));
    try {
      mkdirSync(join(root, "csh"));
      expect(readClaims(root)).toEqual({ claims: [], problems: [] });
      expect(proposeClaim(root, proposal("NotPublic"))).toEqual({ ok: true, path: CLAIMS_PATH });
      expect(proposeClaim(root, proposal("NotPublic"))).toMatchObject({ ok: false, problem: expect.stringContaining("already proposes Errors/NotPublic") });
      expect(proposeClaim(root, { ...proposal("bad name") })).toMatchObject({ ok: false });
      expect(proposeClaim(root, { ...proposal("Odd"), claim: { k: "claim", holds: true, p: { k: "nonsense" } } as never })).toMatchObject({ ok: false, problem: "Odd: claim is not a structural claim" });
      expect(readClaims(root).claims.map((c) => c.name)).toEqual(["NotPublic"]);
      expect(JSON.parse(readFileSync(join(root, CLAIMS_PATH), "utf8")).schema).toBe("csh-claims/v1");
      writeFileSync(join(root, CLAIMS_PATH), JSON.stringify({ schema: "csh-claims/v1", claims: [{ name: "X", intent: "Errors", claim: {}, extra: 1 }] }));
      expect(readClaims(root).problems.map((p) => p.code)).toEqual(["claims-malformed"]);
      writeFileSync(join(root, CLAIMS_PATH), "{");
      expect(readClaims(root).problems.map((p) => p.code)).toEqual(["claims-malformed"]);
      writeFileSync(join(root, CLAIMS_PATH), "null");
      expect(readClaims(root).problems.map((p) => p.code)).toEqual(["claims-malformed"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("are never written through a symbolic link, which could point outside the component", () => {
    const root = mkdtempSync(join(tmpdir(), "claims-"));
    const outside = mkdtempSync(join(tmpdir(), "outside-"));
    try {
      mkdirSync(join(root, "csh"));
      symlinkSync(join(outside, "target.json"), join(root, CLAIMS_PATH));
      expect(proposeClaim(root, proposal("NotPublic"))).toEqual({ ok: false, problem: "csh/claims.json is a symbolic link; claims are written only inside the component" });
      rmSync(join(root, "csh"), { recursive: true });
      symlinkSync(outside, join(root, "csh"));
      expect(proposeClaim(root, proposal("NotPublic"))).toMatchObject({ ok: false, problem: "csh is a symbolic link; claims are written only inside the component" });
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });
});
