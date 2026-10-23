# Architecture

Only the worker imports the analyzer packages (`ana-core`, `ana-store`).

The bot may not import `shop_api`, so it reaches the API over HTTP.

A cog never touches the database (an import contract in `pyproject.toml` forbids it).

The API does not import `sqlalchemy` outside its repositories.
