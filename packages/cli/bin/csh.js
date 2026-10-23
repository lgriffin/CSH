#!/usr/bin/env node
// Entry point for the csh command. Node runs the TypeScript sources directly (type stripping).
import { csh } from "../src/csh.ts";
import { main } from "../src/exit.ts";

await main("csh", csh);
