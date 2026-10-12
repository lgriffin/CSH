# F118

A small hexagonal Python project (`pyproject.toml`, a `src` layout with the package `shop`: domain, ports, adapters)
read through a `Code` source, with nothing installed. `src` is a source root because it is the parent of the top-level
package `shop`, so `from shop.adapters.sql_repository import SqlOrderRepository` on line 2 of the domain's `order.py`
lands on `src/shop/adapters/sql_repository.py`, and `DomainIgnoresAdapters` (ARCH-1) is violated with that file and
line as its reason. The ports import the domain by a relative import and `typing`, which is `python:typing`, so
`PortsIgnoreAdapters` and `PortsSeeOnlyTheDomain` (ARCH-2) are satisfied. `OrderNotFound` extends `DomainError`, which
extends Python's built-in `ValueError`, so the chain reaches `Exception` and the claim citing ERR-1 holds.
`OrderRecord` extends `pydantic.BaseModel`, a base written with a qualifier, so the claim citing ERR-2 is unknown
rather than followed. The relative import `from .connection import connect` lands on no file: it is a `skipped` fact
at its line. Polyglot code ([12](../../docs/spec/12-polyglot-code.md)), sections 1 and 3; A-104, A-127 and A-130;
stage 31.

The expected result was written from the documents before the fixture was first run.
