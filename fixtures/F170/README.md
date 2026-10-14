# F170

A Maven build of four modules under an aggregator `pom.xml` (`shop-parent`, packaging `pom`), read through a `Code`
source with no build tool run. Each module's `artifactId` is a package, holding the Java files under its directory; the
aggregator builds nothing and is no package. The container diagram names `shop-web`, `shop-domain` and `shop-db` and
draws only web to core. `Order.java` in `shop-domain` imports `shop-db`'s `OrderTable` on line 3, so `CoreIgnoresDb`
(`forbid(container("core"), container("db"))`) is violated with that file and line, the closed-world rule
`DiagramIsComplete` (a candidate) is violated too, and the undrawn dependency core to db is a gap naming the line.
`shop-web` depends on `shop-domain` by its manifest and by an import, which the diagram draws: `WebSeesOnlyCore` holds,
and web to core is neither undrawn nor unobserved. `shop-tools` is a package no container holds: the gap
`unplaced-package` names its `pom.xml`. Analyse, danger and grain, section 5; exit of stage 58, with F171 to F173.

The expected result was written from the documents before the fixture was first run.
