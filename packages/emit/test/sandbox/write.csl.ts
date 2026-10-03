import { writeFileSync } from "node:fs";
import { probeSystem } from "./base.ts";
writeFileSync("/tmp/csh-sandbox-probe", "x");
export default probeSystem(0);
