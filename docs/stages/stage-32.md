# Stage 32: Java facts

**Exit:** a Java repository's modules, imports, top-level types, constants and pom.xml are facts, so a layering rule
over a Maven layout is judged and an `inherits` claim follows a Java class chain
([12](../spec/12-polyglot-code.md)).

**Status:** exit reached on fixtures. A hexagonal Maven layout run end to end (`packages/run/test/java.test.ts`) finds
the domain importing an adapter (`violated`, citing `Order.java:3`) and the adapters clear of the application
(`satisfied`). No public Java subject is read yet; that is stage 36.

## Built

- `facts-java` in `@csh/facts-code` (`src/java.ts`), registered in `READERS`. One `module` fact per `.java` file, with
  `language: "java"`. Imports resolve by fully qualified name: each file's `package` and its top-level types index
  every file read, so the source roots of a multi-module build need not be known ([A-131](../../ASSUMPTIONS.md)).
  An explicit or nested import lands on the file declaring the longest known prefix; a wildcard on a package read
  lands on each of its files; a static import lands on its class. Anything else is the Java package, `java.util` as
  written. A type two files declare is a `skipped` fact naming both.
- Declarations: every top-level `class` and `interface` with the first type it extends (type arguments stripped,
  qualification kept), `enum`, `record` and `annotation`, and each `static final` field of a top-level type with a
  literal value as a `const` named `Type.NAME` (interface and annotation fields are implicitly so). Exports: public
  top-level types.
- `pom.xml` fields: coordinates, parent, modules, properties and direct dependencies, read with the stage 29 XML reader.
  A malformed pom.xml is a `malformed-manifest` warning at its line.
- A Java file the parser recovers in is read, with a `syntax-error` warning at its first error.

## What the tests revealed

- A wildcard import of a package read is a dependency on every file of that package, including files that use nothing
  of it, so a `forbid` rule can be violated by an unused wildcard. That is what the source says, and is kept.
- `class Service extends com.x.core.Base` keeps its base qualified, and `inherits` then says `qualified-base`
  (indeterminate) rather than guessing which `Base` is meant.
- Text blocks needed Java's own indentation rule to give the value a `same` claim compares.

## What proved wrong or costly in the documents

- The plan said dependencies resolve "across source roots". Resolving by fully qualified name needs no roots at all,
  and works for Maven, Gradle and ad hoc layouts alike.
- Same-package references and fully qualified names written inline need no import, so they are no dependency here.
  A rule between two classes of one package, or broken only by an inline name, is not seen.

## Effort

About 280 lines of source and 350 lines of tests. Effort was not timed.
