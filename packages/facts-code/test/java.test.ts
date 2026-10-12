// The Java reader (stage 32): fully qualified names resolved across the modules of a Maven build, the declarations and
// exports of top-level types, static final literals, and pom.xml fields.
import { describe, expect, it } from "vitest";
import type { AdapterInput, Fact } from "@csh/witness";
import { javaReader, literalValue, packageOfName, parseWith, run, stripType } from "../src/index.ts";

const enc = (s: string) => new TextEncoder().encode(s);
const input = (files: Record<string, string>): AdapterInput => ({
  source: { name: "Code", kind: "Code", at: "." },
  vocabulary: { units: [], enums: [], states: [], events: [] },
  bindings: [],
  files: Object.entries(files).map(([path, text]) => ({ path, digest: "", bytes: enc(text) })),
  config: { commit: "c1" },
});
const deps = (facts: Fact[]) => facts.flatMap((f) => (f.kind === "depends" ? [[f.at, f.to]] : f.kind === "skipped" ? [[f.at, `skipped: ${f.reason}`]] : []));

const CORE = "core/src/main/java/com/x/core";
const API = "api/src/main/java/com/x/api";
const MAVEN = {
  "pom.xml": `<?xml version="1.0"?>
<project>
  <groupId> com.x </groupId>
  <artifactId>parent</artifactId>
  <version>1.0.0</version>
  <packaging>pom</packaging>
  <modules><module>core</module><module>api</module></modules>
  <properties><maven.compiler.release>21</maven.compiler.release><a/></properties>
  <dependencyManagement><dependencies><dependency><groupId>no</groupId></dependency></dependencies></dependencyManagement>
  <dependencies>
    <dependency><groupId>org.junit</groupId><artifactId>junit</artifactId><version>5.10</version><scope>test</scope></dependency>
    <dependency><groupId>com.google</groupId><artifactId>guava</artifactId></dependency>
  </dependencies>
</project>
`,
  "core/pom.xml": "<project><parent><groupId>com.x</groupId><artifactId>parent</artifactId><version>1.0.0</version></parent><artifactId>core</artifactId></project>",
  [`${CORE}/Base.java`]: "package com.x.core;\n\npublic abstract class Base extends RuntimeException {}\n",
  [`${CORE}/Order.java`]: `package com.x.core;

import java.util.List;
import java.util.Map.Entry;

/** An order. */
@Deprecated
public class Order<T> extends Base implements Comparable<Order<T>> {
  public static final String KIND = "order\\t1";
  static final long MAX = 1_000_000L;
  private static final char SEP = ',';
  static final double RATE = -2.50d, OTHER = 0x10;
  static final boolean ON = true;
  public static final int NOT_LITERAL = MAX_X + 1;
  final int instance = 3;
  static int mutable = 4;
  public static class Line {}
}

class Helper {}
`,
  [`${CORE}/Shape.java`]: `package com.x.core;
public sealed interface Shape<T> extends java.io.Serializable, Comparable<T> permits Order {
  int SIDES = 4;
}
enum Colour { RED; static final String DEFAULT = """
    red
      dark
    """; }
record Point(int x) {}
@interface Marker {}
`,
  [`${API}/Service.java`]: `package com.x.api;

import com.x.core.Order;
import com.x.core.Order.Line;
import com.x.core.*;
import static com.x.core.Order.KIND;
import static com.x.core.Base.*;
import static org.junit.Assert.assertEquals;
import org.slf4j.Logger;
import com.x.api.*;
import com.x.api.Service;

public class Service extends com.x.core.Base {}
`,
  [`${API}/Other.java`]: "package com.x.api;\nimport com.x.missing.*;\ninterface Other {}\n",
};

describe("the Java reader", () => {
  it("is registered for .java files and pom.xml", async () => {
    expect(javaReader.language).toBe("java");
    expect(["pom.xml", "a/pom.xml", "build.gradle", "apom.xml"].map(javaReader.manifest)).toEqual([true, true, false, false]);
    const out = await run(input({ "A.java": "class A {}\n" }));
    expect(out.facts!.map((f) => [f.kind, f.tool.id])).toEqual([
      ["module", "facts-java"],
      ["declare", "facts-java"],
    ]);
  });

  it("resolves imports across the modules of a Maven build by fully qualified name", async () => {
    const out = await run(input(MAVEN));
    expect(deps(out.facts!.filter((f) => f.kind !== "skipped" || f.from.endsWith(".java")))).toEqual([
      [`${API}/Other.java:2`, "com.x.missing"],
      // Explicit, nested, wildcard (one per file of the package), static member and static wildcard imports.
      [`${API}/Service.java:3`, `${CORE}/Order.java`],
      [`${API}/Service.java:4`, `${CORE}/Order.java`],
      [`${API}/Service.java:5`, `${CORE}/Base.java`],
      [`${API}/Service.java:5`, `${CORE}/Order.java`],
      [`${API}/Service.java:5`, `${CORE}/Shape.java`],
      [`${API}/Service.java:6`, `${CORE}/Order.java`],
      [`${API}/Service.java:7`, `${CORE}/Base.java`],
      // External packages are named as Java names them, the standard library included.
      [`${API}/Service.java:8`, "org.junit"],
      [`${API}/Service.java:9`, "org.slf4j"],
      // A wildcard on the file's own package names its other files; an import of itself is nothing.
      [`${API}/Service.java:10`, `${API}/Other.java`],
      [`${CORE}/Order.java:3`, "java.util"],
      [`${CORE}/Order.java:4`, "java.util"],
    ]);
    expect(out.facts!.filter((f) => f.kind === "depends").every((f) => f.kind === "depends" && f.via === "import" && !f.typeOnly)).toBe(true);
    expect(out.facts!.filter((f) => f.kind === "module").map((f) => f.kind === "module" && [f.name, f.language])).toEqual([
      [`${API}/Other.java`, "java"],
      [`${API}/Service.java`, "java"],
      [`${CORE}/Base.java`, "java"],
      [`${CORE}/Order.java`, "java"],
      [`${CORE}/Shape.java`, "java"],
    ]);
    expect(out.diagnostics).toEqual([]);
  });

  it("declares top-level types with their bases, and static final literals", async () => {
    const out = await run(input(MAVEN));
    const declared = out.facts!.flatMap((f) => (f.kind === "declare" ? [[f.at.slice(f.at.lastIndexOf("/") + 1), f.symbol, f.declares, f.base ?? null, f.value ?? null]] : []));
    expect(declared).toEqual([
      ["Other.java:3", "Other", "interface", null, null],
      ["Service.java:13", "Service", "class", "com.x.core.Base", null],
      ["Base.java:3", "Base", "class", "RuntimeException", null],
      ["Order.java:8", "Order", "class", "Base", null],
      ["Order.java:9", "Order.KIND", "const", null, "order\t1"],
      ["Order.java:10", "Order.MAX", "const", null, "1000000"],
      ["Order.java:11", "Order.SEP", "const", null, ","],
      ["Order.java:12", "Order.RATE", "const", null, "-2.5"],
      ["Order.java:12", "Order.OTHER", "const", null, "16"],
      ["Order.java:13", "Order.ON", "const", null, "true"],
      ["Order.java:20", "Helper", "class", null, null],
      ["Shape.java:2", "Shape", "interface", "java.io.Serializable", null],
      ["Shape.java:3", "Shape.SIDES", "const", null, "4"],
      ["Shape.java:5", "Colour", "enum", null, null],
      ["Shape.java:5", "Colour.DEFAULT", "const", null, "red\n  dark\n"],
      ["Shape.java:9", "Point", "record", null, null],
      ["Shape.java:10", "Marker", "annotation", null, null],
    ]);
    const exported = out.facts!.flatMap((f) => (f.kind === "export" ? [`${f.module.slice(f.module.lastIndexOf("/") + 1)} ${f.symbol}`] : []));
    expect(exported).toEqual(["Service.java Service", "Base.java Base", "Order.java Order", "Shape.java Shape"]);
  });

  it("follows a chain of bases to a Java exception, as an inherits claim does", async () => {
    const out = await run(input({ "B.java": "class B extends A {}\n", "A.java": "class A extends RuntimeException {}\n" }));
    const bases = new Map(out.facts!.flatMap((f) => (f.kind === "declare" && f.declares === "class" ? [[f.symbol, f.base]] : [])));
    expect([bases.get("B"), bases.get(bases.get("B")!)]).toEqual(["A", "RuntimeException"]);
  });

  it("reads the fields of a pom.xml that say what the project is", async () => {
    const out = await run(input(MAVEN));
    const fields = out.facts!.flatMap((f) => (f.kind === "field" ? [[f.file, f.path, f.value]] : []));
    expect(fields).toEqual([
      ["core/pom.xml", "/artifactId", "core"],
      ["core/pom.xml", "/parent/groupId", "com.x"],
      ["core/pom.xml", "/parent/artifactId", "parent"],
      ["core/pom.xml", "/parent/version", "1.0.0"],
      ["pom.xml", "/groupId", "com.x"],
      ["pom.xml", "/artifactId", "parent"],
      ["pom.xml", "/version", "1.0.0"],
      ["pom.xml", "/packaging", "pom"],
      ["pom.xml", "/modules/0", "core"],
      ["pom.xml", "/modules/1", "api"],
      ["pom.xml", "/properties/maven.compiler.release", "21"],
      ["pom.xml", "/properties/a", ""],
      ["pom.xml", "/dependencies/0/groupId", "org.junit"],
      ["pom.xml", "/dependencies/0/artifactId", "junit"],
      ["pom.xml", "/dependencies/0/version", "5.10"],
      ["pom.xml", "/dependencies/0/scope", "test"],
      ["pom.xml", "/dependencies/1/groupId", "com.google"],
      ["pom.xml", "/dependencies/1/artifactId", "guava"],
    ]);
    expect(fields.every(([file]) => file !== "build.gradle")).toBe(true);
  });

  it("reports a malformed pom.xml with its line, and reads the rest", async () => {
    const out = await run(input({ "pom.xml": "<project>\n  <groupId>x</groupId>\n  <version>1</vers>\n</project>\n", "A.java": "class A {}\n" }));
    expect(out.diagnostics).toEqual([{ code: "malformed-manifest", severity: "warning", message: expect.any(String), span: "pom.xml:3" }]);
    expect(out.facts!.filter((f) => f.kind === "field")).toEqual([]);
    expect(out.facts!.some((f) => f.kind === "module" && f.name === "A.java")).toBe(true);
  });

  it("skips an import of a type two files declare, and warns of a syntax error", async () => {
    const out = await run(input({ "a/X.java": "package p;\npublic class X {}\n", "b/X.java": "package p;\nclass X {}\n", "c/Y.java": "package q;\nimport p.X;\nclass Y { int = ; }\n" }));
    expect(deps(out.facts!)).toEqual([["c/Y.java:2", "skipped: ambiguous p.X: declared in a/X.java, b/X.java"]]);
    expect(out.diagnostics.map((d) => [d.code, d.span])).toEqual([["syntax-error", "c/Y.java:3"]]);
  });

  it("writes the same facts whatever order the files come in", async () => {
    const a = await run(input(MAVEN));
    const b = await run(input(Object.fromEntries(Object.entries(MAVEN).reverse())));
    expect(b).toEqual(a);
  });
});

describe("Java helpers", () => {
  it("strip type arguments and annotations from a base, keeping its qualification", () => {
    expect(["Base<T>", "a.b.Base<Map<K, V>>", "@NonNull Base", "Outer.Inner<T>"].map(stripType)).toEqual(["Base", "a.b.Base", "Base", "Outer.Inner"]);
  });

  it("name the package of a type that was not read", () => {
    expect(packageOfName("a.b.C", true)).toBe("a.b");
    expect(packageOfName("a.b.C.Inner", true)).toBe("a.b");
    expect(packageOfName("a.b.c", true)).toBe("a.b");
    expect(packageOfName("a.b", false)).toBe("a.b");
  });

  it("normalise literal values", async () => {
    const valueOf = async (expr: string) => {
      return parseWith("java", `class A { static final Object X = ${expr}; }\n`, (root) => literalValue(root.descendantsOfType("variable_declarator")[0]!.childForFieldName("value")));
    };
    const values = await Promise.all(["017", "0b101", "0xFFL", "9223372036854775807L", "1e3", "1.5f", "(7)", "'\\n'", '"\\u0041\\"b"', "+3", "-0", "\"a\" + \"b\"", "X", "null"].map(valueOf));
    expect(values).toEqual(["15", "5", "255", "9223372036854775807", "1000", "1.5", "7", "\n", 'A"b', "3", "0", undefined, undefined, undefined]);
  });
});
