import { describe, expect, it } from "vitest";
import { emptyModule, type Expr } from "@csh/kernel";
import { printExpr, printFragment, printModule } from "@csh/print";

const U = "minor(EUR)";

describe("the canonical printer", () => {
  it("prints arithmetic and comparisons as handle methods", () => {
    const e: Expr = { k: "le", l: { k: "add", l: { k: "field", state: "A", field: "x", at: "pre" }, r: { k: "int", v: "2", unit: U } }, r: { k: "arg", event: "E", name: "y" } };
    expect(printExpr(e, "step")).toBe("pre.x.plus(u_minor_EUR(2)).lte(args.y)");
  });

  it("prints a now reference through its state and an argument through its event outside a step", () => {
    expect(printExpr({ k: "field", state: "Account", field: "balance", at: "now" }, "now")).toBe("Account.balance");
    expect(printExpr({ k: "arg", event: "Withdraw", name: "amount" }, "assumption")).toBe("Withdraw.args.amount");
  });

  it("uses the function form for and/or with other than two operands", () => {
    const t: Expr = { k: "bool", v: true };
    expect(printExpr({ k: "and", xs: [t, t, t] })).toBe("and(truth(true), truth(true), truth(true))");
    expect(printExpr({ k: "or", xs: [t, t] })).toBe("truth(true).or(truth(true))");
  });

  it("prints integers beyond the safe range as bigint literals", () => {
    expect(printExpr({ k: "int", v: "123456789012345678901234567890" }, "now")).toBe("lit(123456789012345678901234567890n)");
  });

  it("is independent of the order in which the model lists its declarations", () => {
    const a = emptyModule("S");
    a.vocabulary.enums = [{ name: "B", members: ["x"] }, { name: "A", members: ["y"] }];
    const b = emptyModule("S");
    b.vocabulary.enums = [{ name: "A", members: ["y"] }, { name: "B", members: ["x"] }];
    expect(printModule(a)).toBe(printModule(b));
  });

  it("prints one binding fragment", () => {
    expect(printFragment(emptyModule("S"), "binding", { target: { k: "result", event: "Withdraw" }, key: "status" })).toBe('s.bind(Withdraw.result, "status");');
  });
});

describe("deterministic events", () => {
  it("prints deterministic only when the event declares it", () => {
    const m = emptyModule("S");
    m.vocabulary.states = [{ name: "A", fields: {} }];
    m.vocabulary.events = [{ name: "E", on: "A", args: {}, deterministic: true }, { name: "F", on: "A", args: {} }];
    const text = printModule(m);
    expect(text).toMatch(/s\.event\("E", \{[^\n]*deterministic: true/);
    expect(text).not.toMatch(/s\.event\("F", \{[^\n]*deterministic/);
  });
});
