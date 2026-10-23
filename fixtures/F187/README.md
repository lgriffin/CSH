# F187

import-linter contracts are mechanisms ([18](../../docs/spec/18-from-the-toads-run.md), section 4; stage 62).

`pyproject.toml` holds two `forbidden` contracts. `docs/architecture.md` holds four told rules:

- Line 3 contains the second contract's name, "Only the worker imports the analyzer", so it is verified by name.
- Line 5 names `shop_api`, which the first contract forbids, and says "bot", a word of that contract's source module
  `shop_bot`, so it is verified by its modules.
- Line 7 says "an import contract" and names `pyproject.toml`, the file that holds the contracts, so it is verified by
  mention.
- Line 9 names `sqlalchemy`, which the first contract forbids, but only for `shop_bot`, and it says nothing of the bot.
  No contract checks it, so it stays told (L2) and `unverified`.

The expected result was written from the specification before the code.
