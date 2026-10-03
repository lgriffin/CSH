import { probeSystem } from "./base.ts";
export default probeSystem((process.env.HOME ?? "").length);
