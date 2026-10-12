// The Python reader (stage 31): modules, imports resolved against source roots and packages, top-level declarations,
// exports from __all__ or public names, and pyproject.toml fields, all from the bytes of the files alone.
import { describe, expect, it } from "vitest";
import type { AdapterInput, Fact } from "@csh/witness";
import { python, run, sourceRoots } from "../src/index.ts";

const enc = (s: string) => new TextEncoder().encode(s);
const input = (files: Record<string, string>): AdapterInput => ({
  source: { name: "Code", kind: "Code", at: "." },
  vocabulary: { units: [], enums: [], states: [], events: [] },
  bindings: [],
  files: Object.entries(files).map(([path, text]) => ({ path, digest: "", bytes: enc(text) })),
  config: { commit: "c1" },
});
const read = async (files: Record<string, string>) => (await run(input(files))).facts!;
const deps = (facts: Fact[]) => facts.flatMap((f) => (f.kind === "depends" ? [[f.at, f.to, f.typeOnly]] : []));
const skips = (facts: Fact[]) => facts.flatMap((f) => (f.kind === "skipped" ? [[f.at, f.reason]] : []));
const decls = (facts: Fact[]) => facts.flatMap((f) => (f.kind === "declare" ? [[f.symbol, f.declares, f.base ?? null, f.value ?? null]] : []));
const exps = (facts: Fact[], module?: string) => facts.flatMap((f) => (f.kind === "export" && (module === undefined || f.module === module) ? [f.from !== undefined ? `${f.symbol} from ${f.from}` : f.symbol] : []));

// A src layout: one top-level package, `app`, with subpackages and relative imports.
const PROJECT = {
  "pyproject.toml": '[project]\nname = "app"\nversion = "1.2.0"\ndependencies = ["requests>=2"]\n\n[build-system]\nrequires = ["hatchling"]\n\n[tool.ruff]\nline-length = 100\n',
  "src/app/__init__.py": "from .api import *\n",
  "src/app/api.py": "from app.domain import models\nfrom app.domain.models import Order, Line\nfrom .adapters import db\nimport app.adapters.db as store\n",
  "src/app/domain/__init__.py": "",
  "src/app/domain/models.py": "from ..adapters.db import Session\nfrom . import rules\nfrom .rules import check\nclass Order: pass\nclass Line: pass\n",
  "src/app/domain/rules.py": "def check(): pass\n",
  "src/app/adapters/__init__.py": "",
  "src/app/adapters/db.py": "import requests\nimport os.path\nfrom collections import abc\nclass Session: pass\n",
  "tests/test_api.py": "from app import api\nimport conftest\n",
  "tests/conftest.py": "",
};

describe("python modules and dependencies", () => {
  it("writes one module per .py and .pyi file, as facts-py", async () => {
    const facts = await read({ "a.py": "", "b.pyi": "", "c.ts": "export {};\n" });
    const mods = facts.filter((f) => f.kind === "module");
    expect(mods.map((f) => [f.at, f.kind === "module" ? (f.language ?? null) : null, f.tool.id])).toEqual([
      ["c.ts", null, "facts-ts"],
      ["a.py", "python", "facts-py"],
      ["b.pyi", "python", "facts-py"],
    ]);
    expect(facts.find((f) => f.tool.id === "facts-py")!.tool.version).toBe("0.1.0");
  });

  it("resolves a src layout, relative imports, submodules and externals", async () => {
    const facts = await read(PROJECT);
    expect(deps(facts)).toEqual([
      ["src/app/__init__.py:1", "src/app/api.py", false],
      ["src/app/adapters/db.py:1", "requests", false],
      ["src/app/adapters/db.py:2", "python:os", false],
      ["src/app/adapters/db.py:3", "python:collections", false],
      // `from app.domain import models` is the submodule; `from app.domain.models import Order` the module itself.
      ["src/app/api.py:1", "src/app/domain/models.py", false],
      ["src/app/api.py:2", "src/app/domain/models.py", false],
      ["src/app/api.py:3", "src/app/adapters/db.py", false],
      ["src/app/api.py:4", "src/app/adapters/db.py", false],
      ["src/app/domain/models.py:1", "src/app/adapters/db.py", false],
      ["src/app/domain/models.py:2", "src/app/domain/rules.py", false],
      ["src/app/domain/models.py:3", "src/app/domain/rules.py", false],
      ["tests/test_api.py:1", "src/app/api.py", false],
      // A directory with no __init__.py is no source root, so a test's sibling import is read as a package (A-1xx-python).
      ["tests/test_api.py:2", "conftest", false],
    ]);
    expect(skips(facts)).toEqual([]);
  });

  it("finds the source roots: the root, src, and the parent of each top-level package", () => {
    expect(sourceRoots(new Set(["lib/pkg/__init__.py", "lib/pkg/sub/__init__.py", "src/app/__init__.py", "x.py"]))).toEqual(["", "lib", "src"]);
  });

  it("takes the first root in code-point order when two hold the module", async () => {
    const facts = await read({ "util.py": "", "src/util.py": "", "src/main.py": "import util\n" });
    expect(deps(facts)).toEqual([["src/main.py:1", "util.py", false]]);
  });

  it("resolves .pyi stubs, packages and namespace packages", async () => {
    const facts = await read({ "ns/inner/mod.py": "", "typed/__init__.pyi": "", "stub.pyi": "", "main.py": "import ns.inner.mod\nimport typed\nimport stub\nimport ns.inner\n" });
    expect(deps(facts)).toEqual([
      ["main.py:1", "ns/inner/mod.py", false],
      ["main.py:2", "typed/__init__.pyi", false],
      ["main.py:3", "stub.pyi", false],
    ]);
    // A namespace package's directory is no file: local, but not resolved.
    expect(skips(facts)).toEqual([["main.py:4", "unresolved ns.inner"]]);
  });

  it("skips an unresolved relative import, and drops a self-import", async () => {
    const facts = await read({ "pkg/__init__.py": "from . import missing_name\n", "pkg/a.py": "from .gone import x\nfrom ... import y\nfrom . import a\n" });
    expect(skips(facts)).toEqual([
      ["pkg/a.py:1", "unresolved .gone"],
      ["pkg/a.py:2", "unresolved ..."],
    ]);
    // `from . import missing_name` falls back to the package itself, which is the importing file.
    expect(deps(facts)).toEqual([]);
  });

  it("reads literal dynamic imports, skips computed ones, and counts imports in function bodies", async () => {
    const facts = await read({ "a.py": 'import importlib\ndef f(name):\n    import json\n    importlib.import_module("b")\n    __import__("yaml")\n    importlib.import_module(name)\n    __import__(f"x{name}")\n', "b.py": "" });
    expect(deps(facts)).toEqual([
      ["a.py:1", "python:importlib", false],
      ["a.py:3", "python:json", false],
      ["a.py:4", "b.py", false],
      ["a.py:5", "yaml", false],
    ]);
    expect(skips(facts)).toEqual([
      ["a.py:6", "computed specifier"],
      ["a.py:7", "computed specifier"],
    ]);
  });

  it("marks imports under `if TYPE_CHECKING:` type-only, and no others", async () => {
    const facts = await read({ "a.py": "from __future__ import annotations\nimport typing\nif typing.TYPE_CHECKING:\n    from b import B\nelse:\n    import c\nif TYPE_CHECKING:\n    import d\n", "b.py": "" });
    expect(deps(facts)).toEqual([
      ["a.py:2", "python:typing", false],
      ["a.py:4", "b.py", true],
      ["a.py:6", "c", false],
      ["a.py:8", "d", true],
    ]);
  });

  it("names a dependency on the standard library python:<name>, and any other by its top-level package", async () => {
    const facts = await read({ "a.py": "import xml.etree.ElementTree\nfrom google.cloud import storage\nimport tomllib, numpy as np\n" });
    expect(deps(facts).map((d) => d[1])).toEqual(["python:xml", "google", "python:tomllib", "numpy"]);
  });
});

describe("python declarations", () => {
  it("declares classes with their first base, functions, constants, variables and type aliases", async () => {
    const text = [
      "from typing import Final, Generic, TypeVar",
      "class Plain: pass",
      "class Child(Base): pass",
      "class Q(mod.Base, Mixin, metaclass=Meta): pass",
      "class G(Generic[T]): pass",
      "@dataclass",
      "class D: pass",
      "def f(): pass",
      "async def g(): pass",
      "@cache",
      "def h(): pass",
      "MAX_SIZE = 1_000",
      "RATE = 0.50",
      "NAME = 'svc'",
      "debug = True",
      "Off: Final = False",
      "LIMIT: typing.Final[int] = 0x10",
      "GREETING = f'hi {NAME}'",
      "computed = len([])",
      "a, (b, *rest) = 1, (2, 3)",
      "X = Y = 'both'",
      "type Alias = list[int]",
      "if True:",
      "    hidden = 1",
      "def outer():",
      "    inner = 2",
    ].join("\n");
    const facts = await read({ "m.py": text });
    expect(decls(facts)).toEqual([
      ["Plain", "class", null, null],
      ["Child", "class", "Base", null],
      ["Q", "class", "mod.Base", null],
      ["G", "class", "Generic[T]", null],
      ["D", "class", null, null],
      ["f", "function", null, null],
      ["g", "function", null, null],
      ["h", "function", null, null],
      ["MAX_SIZE", "const", null, "1000"],
      ["RATE", "const", null, "0.5"],
      ["NAME", "const", null, "svc"],
      ["debug", "var", null, "true"],
      ["Off", "const", null, "false"],
      ["LIMIT", "const", null, "16"],
      ["GREETING", "const", null, null],
      ["computed", "var", null, null],
      ["a", "var", null, null],
      ["b", "var", null, null],
      ["rest", "var", null, null],
      ["X", "const", null, "both"],
      ["Y", "const", null, "both"],
      ["Alias", "type", null, null],
      ["outer", "function", null, null],
    ]);
    // A decorated definition is at its decorator's line.
    expect(facts.find((f) => f.kind === "declare" && f.symbol === "D")!.at).toBe("m.py:6");
  });

  it("decodes string escapes, keeps raw strings as written, and gives bytes no value", async () => {
    const facts = await read({ "m.py": 'A = "a\\tb"\nB = r"a\\tb"\nC = b"x"\nD = "x" "y"\nE = """multi\nline"""\n' });
    expect(decls(facts).map((d) => d[3])).toEqual(["a\tb", "a\\tb", null, "xy", "multi\nline"]);
  });
});

describe("python exports", () => {
  it("exports what __all__ lists", async () => {
    const facts = await read({ "m.py": "__all__ = ['a', \"B\"]\ndef a(): pass\nclass B: pass\ndef c(): pass\n", "t.py": "__all__ = ('x',)\nx = 1\n" });
    expect(exps(facts, "m.py")).toEqual(["a", "B"]);
    expect(exps(facts, "t.py")).toEqual(["x"]);
    expect(facts.filter((f) => f.kind === "export").every((f) => f.kind === "export" && f.typeOnly === false && f.at === f.module)).toBe(true);
  });

  it("declares a class nested in a class body under its dotted name, and exports only top-level names (A-170)", async () => {
    const facts = await read({ "m.py": "class Updater(Base):\n    class Signals(QObject):\n        @dataclass\n        class Payload: pass\n    def run(self):\n        class Local: pass\ndef make():\n    class Inner: pass\n" });
    expect(decls(facts)).toEqual([
      ["Updater", "class", "Base", null],
      ["Updater.Signals", "class", "QObject", null],
      ["Updater.Signals.Payload", "class", null, null],
      ["make", "function", null, null],
    ]);
    expect(exps(facts)).toEqual(["Updater", "make"]);
  });

  it("exports every public top-level name when there is no __all__", async () => {
    const facts = await read({ "m.py": "import os\nclass A: pass\ndef _private(): pass\n_HIDDEN = 1\nVISIBLE = 2\nVISIBLE = 3\n" });
    expect(exps(facts)).toEqual(["A", "VISIBLE"]);
  });

  it("skips a computed __all__ and exports nothing", async () => {
    for (const all of ["__all__ = names()", "__all__ = ['a'] + other.__all__", "__all__ = ['a']\n__all__ += ['b']", "__all__ = [name]"]) {
      const facts = await read({ "m.py": `${all}\ndef a(): pass\n` });
      expect(exps(facts), all).toEqual([]);
      expect(skips(facts), all).toEqual([[`m.py:${all.split("\n").length}`, "computed __all__"]]);
    }
  });

  it("exports * from a package that re-exports with a star import", async () => {
    const facts = await read({ "pkg/__init__.py": "from .models import *\nfrom os.path import *\nVERSION = '1'\n", "pkg/models.py": "class M: pass\n", "pkg/other.py": "from .models import *\n" });
    expect(exps(facts, "pkg/__init__.py")).toEqual(["VERSION", "* from .models", "* from os.path"]);
    expect(exps(facts, "pkg/other.py")).toEqual([]);
  });
});

describe("pyproject.toml", () => {
  it("reads the project and build-system tables, and nothing else", async () => {
    const facts = await read(PROJECT);
    const fields = facts.flatMap((f) => (f.kind === "field" ? [[f.path, f.value, f.tool.id]] : []));
    expect(fields).toEqual([
      ["/project/name", "app", "facts-py"],
      ["/project/version", "1.2.0", "facts-py"],
      ["/project/dependencies/0", "requests>=2", "facts-py"],
      ["/build-system/requires/0", "hatchling", "facts-py"],
    ]);
    expect(python.manifest("sub/pyproject.toml")).toBe(true);
    expect(["requirements.txt", "requirements-dev.txt", "setup.cfg", "setup.py.toml"].map(python.manifest)).toEqual([false, false, false, false]);
  });

  it("reports a malformed pyproject.toml as a diagnostic", async () => {
    const out = await run(input({ "pyproject.toml": "[project\n" }));
    expect(out.diagnostics.map((d) => [d.code, d.span])).toEqual([["malformed-manifest", "pyproject.toml"]]);
  });
});

describe("determinism", () => {
  it("writes the same facts in the same order whatever order the files come in", async () => {
    const forward = await read(PROJECT);
    const backward = await read(Object.fromEntries(Object.entries(PROJECT).reverse()));
    expect(backward).toEqual(forward);
    const paths = forward.filter((f) => f.tool.id === "facts-py" && f.kind === "module").map((f) => f.at);
    expect(paths).toEqual([...paths].sort());
  });
});
