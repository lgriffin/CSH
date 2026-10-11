#!/usr/bin/env node
// Entry point for the csh command. Node runs the TypeScript sources directly (type stripping).
import { csh } from "../src/csh.ts";

const code = await csh(process.argv.slice(2), { out: (s) => process.stdout.write(s), err: (s) => process.stderr.write(s), cwd: process.cwd() });
// Exit only once stdout has drained: process.exit would cut piped output short at the pipe's buffer.
process.stdout.write("", () => process.exit(code));
