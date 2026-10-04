#!/usr/bin/env node
// The agent tool server for one component: csh-agent [--root <component>]. It speaks the Model Context Protocol on
// standard input and output, so nothing else may write to standard output.
import { resolve } from "node:path";
import { projectRoot } from "@csh/run";
import { createZ3Solver } from "@csh/solver";
import { serve } from "../src/server.ts";

const i = process.argv.indexOf("--root");
const root = projectRoot(process.cwd(), i >= 0 ? resolve(process.argv[i + 1] ?? ".") : undefined);
await serve({ root, solver: await createZ3Solver() });
