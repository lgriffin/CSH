import { probeSystem } from "./base.ts";
const r = await fetch("https://example.com");
export default probeSystem(r.status);
