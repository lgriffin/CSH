#!/usr/bin/env node
// Entry point for the csl command. Node runs the TypeScript sources directly (type stripping).
import { csl } from "../src/csl.ts";
import { main } from "../src/exit.ts";

await main("csl", csl);
