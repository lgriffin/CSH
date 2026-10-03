import { execSync } from "node:child_process";
import { probeSystem } from "./base.ts";
export default probeSystem(execSync("echo 1").length);
