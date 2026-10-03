// Shared by the sandbox probes: a minimal valid system whose literal comes from a probe.
import { system, int, unit } from "csl";

export function probeSystem(value: number) {
  const EUR = unit("minor", "EUR");
  return system("Probe", (s) => {
    const Account = s.state("Account", { balance: int(EUR) });
    s.policy("P", { require: ["SolverCheck"], reject: [] });
    s.intent("I", { owner: "O", value: "v", assurance: "P" }, (i) => {
      i.invariant("Floor", Account.balance.gte(EUR(value)));
    });
  });
}
