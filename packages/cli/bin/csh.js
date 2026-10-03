#!/usr/bin/env node
// Entry point for the csh command. Node runs the TypeScript sources directly (type stripping).
import { csh } from "../src/csh.ts";

const code = await csh(process.argv.slice(2), { out: (s) => process.stdout.write(s), err: (s) => process.stderr.write(s), cwd: process.cwd() });
process.exit(code);
