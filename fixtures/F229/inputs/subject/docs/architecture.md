# Architecture

The core never imports the adapters; `pnpm lint:layers` fails on any such import.

Ports import nothing.

- **2026-10-08, no import cycles.** The core no longer imports its adapters.
- **Done when.** The site imports nothing from the core.

The site never imports the adapters; `pnpm dev` serves it.
