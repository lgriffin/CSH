// The Go reader (stage 33): modules, imports resolved against go.mod and go.work, top-level declarations, capitalised
// exports, and the fields of go.mod and go.work, read from the bytes of the files alone.
import { describe, expect, it } from "vitest";
import type { AdapterInput, Fact } from "@csh/witness";
import { matchesGlobs } from "@csh/kernel";
import { parseGoMod, run } from "../src/index.ts";

const enc = (s: string) => new TextEncoder().encode(s);
const input = (files: Record<string, string>): AdapterInput => ({
  source: { name: "Code", kind: "Code", at: "." },
  vocabulary: { units: [], enums: [], states: [], events: [] },
  bindings: [],
  files: Object.entries(files).map(([path, text]) => ({ path, digest: "", bytes: enc(text) })),
  config: { commit: "c1" },
});
const read = async (files: Record<string, string>) => {
  const out = await run(input(files));
  return { facts: out.facts ?? [], diagnostics: out.diagnostics };
};
const of = <K extends Fact["kind"]>(facts: Fact[], kind: K) => facts.filter((f): f is Extract<Fact, { kind: K }> => f.kind === kind);

const SHOP = {
  "go.mod": `// The shop.
module example.com/shop

go 1.22
toolchain go1.22.4

require github.com/google/uuid v1.6.0
require (
	golang.org/x/sync v0.7.0 // indirect
	github.com/lib/pq v1.10.9
)

replace github.com/lib/pq => ../pq
replace golang.org/x/sync v0.7.0 => golang.org/x/sync v0.8.0
exclude github.com/bad/mod v0.1.0
retract [v1.0.0, v1.0.5]
`,
  "internal/domain/order.go": `package domain

import "errors"

// Status of an order.
type Status int

const (
	Pending Status = iota
	Paid
	cancelled
)

const Currency = "EUR"
const raw, Rate = \`a\\b\`, 1.50
const Big, Octal, Hex = 1_000_000, 017, 0x1F
const Shipped = true

var ErrEmpty = errors.New("empty")

type Order struct {
	Base
	ID    string
	total int
}

type Repository interface {
	Save(o Order) error
}

type Base struct{}

type ID = string

type Page[T any] struct{ Items []T }

func New(id string) Order { return Order{ID: id} }

func (o *Order) Total() int { return o.total }

func (o Order) valid() bool { return o.ID != "" }

func (p Page[T]) Len() int { return len(p.Items) }

func (s status) String() string { return "" }

type status int

func helper() {}
`,
  "internal/domain/order_test.go": `package domain_test

import (
	"testing"

	"example.com/shop/internal/domain"
)

func TestNew(t *testing.T) { domain.New("1") }
`,
  "internal/adapters/db/repo.go": `package db

import (
	"context"
	sql "database/sql"
	_ "github.com/lib/pq"
	. "strings"
	"C"

	"example.com/shop/internal/domain"
	"example.com/shop/internal/missing"
)

type Repo struct{ db *sql.DB }

func (r *Repo) Save(ctx context.Context, o domain.Order) error { _ = ToUpper; return nil }
`,
  "internal/adapters/db/conn.go": `package db
`,
  "cmd/shop/main.go": `package main

import (
	"fmt"
	"net/http"

	"github.com/google/uuid"
	"example.com/shop/internal/adapters/db"
	dom "example.com/shop/internal/domain"
)

func main() { fmt.Println(http.StatusOK, uuid.New(), db.Repo{}, dom.New("x")) }
`,
};

describe("the Go reader", () => {
  it("writes one module per .go file, test files included, with its language", async () => {
    const { facts } = await read(SHOP);
    expect(of(facts, "module").map((m) => [m.name, m.language, m.tool.id])).toEqual([
      ["cmd/shop/main.go", "go", "facts-go"],
      ["internal/adapters/db/conn.go", "go", "facts-go"],
      ["internal/adapters/db/repo.go", "go", "facts-go"],
      ["internal/domain/order.go", "go", "facts-go"],
      ["internal/domain/order_test.go", "go", "facts-go"],
    ]);
    expect(facts.every((f) => f.subject.commit === "c1")).toBe(true);
  });

  it("resolves imports: local packages to their files, the standard library as go:, others as written", async () => {
    const { facts } = await read(SHOP);
    const deps = of(facts, "depends").map((d) => [d.at, d.to]);
    expect(deps).toEqual([
      ["cmd/shop/main.go:4", "go:fmt"],
      ["cmd/shop/main.go:5", "go:net/http"],
      ["cmd/shop/main.go:7", "github.com/google/uuid"],
      ["cmd/shop/main.go:8", "internal/adapters/db/conn.go"],
      ["cmd/shop/main.go:8", "internal/adapters/db/repo.go"],
      ["cmd/shop/main.go:9", "internal/domain/order.go"],
      ["internal/adapters/db/repo.go:4", "go:context"],
      ["internal/adapters/db/repo.go:5", "go:database/sql"],
      ["internal/adapters/db/repo.go:6", "github.com/lib/pq"],
      ["internal/adapters/db/repo.go:7", "go:strings"],
      ["internal/adapters/db/repo.go:8", "go:C"],
      ["internal/adapters/db/repo.go:10", "internal/domain/order.go"],
      ["internal/domain/order.go:3", "go:errors"],
      ["internal/domain/order_test.go:4", "go:testing"],
      ["internal/domain/order_test.go:6", "internal/domain/order.go"],
    ]);
    expect(of(facts, "depends").every((d) => d.via === "import" && d.typeOnly === false)).toBe(true);
    expect(of(facts, "skipped").map((s) => [s.at, s.reason])).toEqual([["internal/adapters/db/repo.go:11", "unresolved example.com/shop/internal/missing"]]);
  });

  it("names a local dependency by file, so a module glob over the package directory selects it", () => {
    // A glob `dir/**` does not select the directory itself; it selects the files under it.
    expect(matchesGlobs("internal/db", ["internal/db/**"])).toBe(false);
    expect(matchesGlobs("internal/db/repo.go", ["internal/db/**"])).toBe(true);
  });

  it("declares top-level names, with methods as Type.Method and literal constant values", async () => {
    const { facts } = await read(SHOP);
    const decl = of(facts, "declare").filter((d) => d.module === "internal/domain/order.go").map((d) => [d.symbol, d.declares, d.value, d.base]);
    expect(decl).toEqual([
      ["Status", "type", undefined, undefined],
      ["Pending", "const", undefined, undefined],
      ["Paid", "const", undefined, undefined],
      ["cancelled", "const", undefined, undefined],
      ["Currency", "const", "EUR", undefined],
      ["raw", "const", "a\\b", undefined],
      ["Rate", "const", "1.5", undefined],
      ["Big", "const", "1000000", undefined],
      ["Octal", "const", "15", undefined],
      ["Hex", "const", "31", undefined],
      ["Shipped", "const", "true", undefined],
      ["ErrEmpty", "var", undefined, undefined],
      ["Order", "struct", undefined, undefined],
      ["Repository", "interface", undefined, undefined],
      ["Base", "struct", undefined, undefined],
      ["ID", "type", undefined, undefined],
      ["Page", "struct", undefined, undefined],
      ["New", "function", undefined, undefined],
      ["Order.Total", "method", undefined, undefined],
      ["Order.valid", "method", undefined, undefined],
      ["Page.Len", "method", undefined, undefined],
      ["status.String", "method", undefined, undefined],
      ["status", "type", undefined, undefined],
      ["helper", "function", undefined, undefined],
    ]);
    expect(of(facts, "declare").find((d) => d.symbol === "Repo.Save")?.at).toBe("internal/adapters/db/repo.go:16");
  });

  it("exports capitalised names, and a method only when its type is exported too", async () => {
    const { facts } = await read(SHOP);
    const exp = of(facts, "export").filter((e) => e.module === "internal/domain/order.go").map((e) => [e.symbol, e.typeOnly]);
    expect(exp).toEqual([
      ["Status", true],
      ["Pending", false],
      ["Paid", false],
      ["Currency", false],
      ["Rate", false],
      ["Big", false],
      ["Octal", false],
      ["Hex", false],
      ["Shipped", false],
      ["ErrEmpty", false],
      ["Order", true],
      ["Repository", true],
      ["Base", true],
      ["ID", true],
      ["Page", true],
      ["New", false],
      ["Order.Total", false],
      ["Page.Len", false],
    ]);
  });

  it("reads go.mod into fields", async () => {
    const { facts, diagnostics } = await read(SHOP);
    expect(of(facts, "field").map((f) => [f.path, f.value, f.at])).toEqual([
      ["/module", "example.com/shop", "go.mod:2"],
      ["/go", "1.22", "go.mod:4"],
      ["/toolchain", "go1.22.4", "go.mod:5"],
      ["/require/github.com~1google~1uuid", "v1.6.0", "go.mod:7"],
      ["/require/golang.org~1x~1sync", "v0.7.0", "go.mod:9"],
      ["/indirect/golang.org~1x~1sync", "true", "go.mod:9"],
      ["/require/github.com~1lib~1pq", "v1.10.9", "go.mod:10"],
      ["/replace/github.com~1lib~1pq", "../pq", "go.mod:13"],
      ["/replace/golang.org~1x~1sync", "golang.org/x/sync v0.8.0", "go.mod:14"],
      ["/exclude/github.com~1bad~1mod", "v0.1.0", "go.mod:15"],
      ["/retract/0", "[v1.0.0, v1.0.5]", "go.mod:16"],
    ]);
    expect(diagnostics).toEqual([]);
  });

  it("warns of a malformed go.mod line, and still reads the rest", async () => {
    const { facts, diagnostics } = await read({ "go.mod": "module example.com/m\nfrobnicate all\nrequire (\n\tx.io/y v1.0.0\n)\n", "a.go": "package m\n" });
    expect(diagnostics).toEqual([{ code: "malformed-manifest", severity: "warning", message: "an unknown go.mod directive: frobnicate", span: "go.mod:2" }]);
    expect(of(facts, "field").map((f) => f.path)).toEqual(["/module", "/require/x.io~1y"]);
    expect(of(facts, "module").map((m) => m.name)).toEqual(["a.go"]);
  });

  it("parses go.mod blocks and comments by hand", () => {
    expect(parseGoMod('module "q.io/m" // the module\nrequire (\n// none\n)\nrequire (\n').problems).toEqual([{ line: 6, message: "an unclosed require block" }]);
    expect(parseGoMod('module "q.io/m" // the module\n').directives).toEqual([{ verb: "module", args: ["q.io/m"], indirect: false, line: 1 }]);
  });

  it("resolves imports between the modules a go.work uses, and reads its use directories", async () => {
    const { facts } = await read({
      "go.work": "go 1.22\n\nuse (\n\t./api\n\t./lib\n)\n",
      "api/go.mod": "module example.com/api\n\ngo 1.22\n",
      "api/server.go": 'package api\n\nimport (\n\t"example.com/lib/text"\n\t"example.com/other"\n)\n',
      "lib/go.mod": "module example.com/lib\n",
      "lib/text/text.go": "package text\n",
      "solo/go.mod": "module example.com/solo\n",
      "solo/main.go": 'package main\n\nimport "example.com/lib/text"\n',
    });
    expect(of(facts, "field").filter((f) => f.file === "go.work").map((f) => [f.path, f.value])).toEqual([
      ["/go", "1.22"],
      ["/use/0", "./api"],
      ["/use/1", "./lib"],
    ]);
    expect(of(facts, "depends").map((d) => [d.from, d.to])).toEqual([
      ["api/server.go", "lib/text/text.go"],
      ["api/server.go", "example.com/other"],
      // A module the workspace does not use resolves another module's import path as an external one.
      ["solo/main.go", "example.com/lib/text"],
    ]);
  });

  it("resolves the module root package to its files", async () => {
    const { facts } = await read({ "go.mod": "module shop\n", "shop.go": "package shop\n", "cmd/x/main.go": 'package main\n\nimport "shop"\n' });
    expect(of(facts, "depends").map((d) => d.to)).toEqual(["shop.go"]);
  });
});
