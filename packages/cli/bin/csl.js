#!/usr/bin/env node
// Entry point for the csl command. Node runs the TypeScript sources directly (type stripping).
import { csl } from "../src/csl.ts";

const code = await csl(process.argv.slice(2), { out: (s) => process.stdout.write(s), err: (s) => process.stderr.write(s), cwd: process.cwd() });
process.exit(code);
