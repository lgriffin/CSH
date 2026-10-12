# F141

Two Java files in Maven's `src/main/java` layout, read through a `Code` source with no build tool run. The user
interface's `LedgerView.java` imports `java.sql.SQLException` on line 3, and the core's `Ledger.java` imports
`java.util.List` on line 3. A Java import that lands on no file read depends on its package, the segments before the
first capitalised one, and standard packages are named as written, so the facts record the dependencies `java.sql` and
`java.util` (A-131; [12](../../docs/spec/12-polyglot-code.md), section 3).

A selector glob ending in `.*` or `.**` also selects the name before that suffix when it holds no `/`, so both
`modules("java.sql.*")` and `modules("java.sql.**")` select `java.sql`: `UiUsesNoJdbc` and `UiUsesNoJdbcAtAnyDepth`
(ARCH-1) are violated, each with the importing file and line as its reason (A-171). `modules("java.sql.Connection")`
does not select `java.sql`, but its text starts with `java.sql.`, so it names something under a name the facts record
whole: no dependency violates `UiOpensNoConnection` (ARCH-2), and since the user interface depends on `java.sql` it is
unknown, reason `finer-than-facts`, naming the selector and giving the dependency's file and line, not held (A-172).
Nothing depends on `javax.swing` or on any `javax` name, so `UiUsesNoSwing` (ARCH-3) selects nothing the facts know
and holds with the reason `target-selects-nothing`, which the overview now shows as its entry's detail (section 3,
A-173; the overview is not compared here). The core's only offending dependency is on `java.util`, which its one
allowed glob `java.util.List` is finer than, so `CoreUsesOnlyLists` (ARCH-4) is unknown with `finer-than-facts`, not
violated (A-172). From the Java and Python runs ([14](../../docs/spec/14-from-the-java-and-python-runs.md)), sections 2
and 3; stage 45.

The expected result was written from the documents before the fixture was first run.
