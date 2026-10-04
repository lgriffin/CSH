#!/usr/bin/env node
// Entry point for the facts-imports command. Node runs the TypeScript sources directly (type stripping).
import { main } from "../src/scan.ts";

process.exit(main(process.argv.slice(2), { out: (s) => process.stdout.write(s), err: (s) => process.stderr.write(s), cwd: process.cwd(), env: process.env }));
