import { connect } from "node:net";
import { probeSystem } from "./base.ts";
connect(80, "example.com");
export default probeSystem(0);
