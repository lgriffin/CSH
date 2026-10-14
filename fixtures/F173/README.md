# F173

Four Python distributions side by side, each a `pyproject.toml` with a `src` layout (`core`, `db`, `web`, `tools`),
read through a `Code` source with nothing installed. Each `[project] name` is a package, holding the Python files under
its `pyproject.toml`. The container diagram names `shop-web`, `shop-core` and `shop-db` and draws only web to core.
`shop-core` lists `shop-db` among its dependencies and imports `shop_db.tables` on line 2 of `orders.py`, so
`CoreIgnoresDb` is violated with that file and line, `DiagramIsComplete` is violated too, and core to db is an
undrawn dependency naming the line. `shop-web` depends on `shop-core`, which the diagram draws: `WebSeesOnlyCore`
holds. `shop-tools` is a package no container holds: the gap `unplaced-package` names its `pyproject.toml`. Analyse,
danger and grain, section 5; exit of stage 58.

The expected result was written from the documents before the fixture was first run.
