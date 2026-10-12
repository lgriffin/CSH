# Rules

- ARCH-1: Session pods hold no database access, directly or through core.
- ARCH-2: The frontend imports only types from core.
- ARCH-3: Packages under src depend on each other without cycles.
- ARCH-4: Core never imports from the packages directory.
- DOC-1: There are ten use cases.
- DOC-2: The repository is pinned to pnpm 9.
- DOC-3: The workspace lists two globs.
