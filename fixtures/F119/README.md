# F119

A small hexagonal Java project (`pom.xml`, Maven's `src/main/java` layout, packages `com.acme.shop.domain`, `ports`
and `adapters`) read through a `Code` source, with no build tool run. Imports resolve by fully qualified name, so
`import com.acme.shop.adapters.JdbcOrderRepository;` on line 3 of `Order.java` lands on the file that declares that
class, and `DomainIgnoresAdapters` (ARCH-1) is violated with that file and line as its reason. The port imports only
the domain's `Order`, so `PortsIgnoreAdapters` and `PortsSeeOnlyTheDomain` (ARCH-2) are satisfied.
`OrderNotFoundException` extends `DomainException`, which extends Java's built-in `RuntimeException`, so the chain
reaches `Exception` and the claim citing ERR-1 holds. `JdbcOrderRepository` extends Spring's `JdbcDaoSupport`, a class
the source does not hold, so whether it is a `DaoSupport` is unknown, with the base not read as its reason. Polyglot
code ([12](../../docs/spec/12-polyglot-code.md)), sections 1 and 3; A-104, A-127 and A-131; stage 32.

The expected result was written from the documents before the fixture was first run.
