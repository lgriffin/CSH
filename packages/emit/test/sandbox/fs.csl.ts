import { readFileSync } from "node:fs";
import { probeSystem } from "./base.ts";
export default probeSystem(readFileSync("/etc/hostname", "utf8").length);
