# Hermes, a subject profile

Evaluates https://github.com/lgriffin/hermes from outside, pinned to main at `cebab9d74048b17b21ef6d481d6f6bf63d507a18`
(cloned from the local path `D:/code/hermes`, read-only). Run:

```
node packages/cli/bin/csh.js subject fetch --root subjects/hermes
node packages/cli/bin/csh.js run --root subjects/hermes
node packages/cli/bin/csh.js overview --root subjects/hermes
```

Sources: docs (architecture notes and ADRs), Gherkin features (EARS `Rule:` lines), cucumber step definitions as the
tests, and TypeScript code under `packages/*/src`. Only identifiers, paths and counts are committed, never repo text.

On Windows the clone needs `core.longpaths=true` (some step-definition filenames exceed 260 characters); set it for the
process with `GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.longpaths GIT_CONFIG_VALUE_0=true`.
`csh/spec.csl.ts` states four layering rules; those that target `modules("packages/<other>/**")` are vacuous, because
`@hermes/*` imports are read as packages, not modules.
