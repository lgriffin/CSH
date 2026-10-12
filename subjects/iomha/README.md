# iomha, a subject profile

Evaluates [iomha](https://github.com/PoolPooer/iomha) from outside, pinned to `main` at `fea6ca9` and used as a diagnostic of CSH. Only read; nothing is written to the repository. Only identifiers, paths and counts are committed here, never its text.

```
node packages/cli/bin/csh.js subject fetch --root subjects/iomha
node packages/cli/bin/csh.js run --root subjects/iomha
node packages/cli/bin/csh.js overview --root subjects/iomha
```

The repository is a TypeScript pnpm monorepo (about 1,275 `.ts` files) with Gherkin Rules (31 features), ADRs and guides, plus Rust crates (`verify/`) and GraphQL, SQL and shell that CSH has no reader for.
