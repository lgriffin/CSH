# F122

A `Code` source holding TypeScript beside a Kotlin file (`src/core/engine.kt`) and a C file (`src/legacy/report.c`),
languages with no reader. Each of those files is a `skipped` fact at the file, `no reader for <language>`. A `forbid`
rule whose `from` selects such a file is unknown (`not-read`) unless what was read already violates it: the core's
Kotlin file could import the web layer, so `CoreIgnoresWeb` (ARCH-1) is unknown, never satisfied, though the core's
TypeScript imports nothing; the legacy code's TypeScript imports the web server on line 1 of `export.ts`, so
`LegacyIgnoresWeb` (ARCH-2) is violated whatever the C file holds; and `WebIgnoresLegacy` (ARCH-3) selects only files
that were read, so it is satisfied. Polyglot code ([12](../../docs/spec/12-polyglot-code.md)), sections 1 and 5
(stage 29's exit); A-127; stage 29.

The expected result was written from the documents before the fixture was first run.
