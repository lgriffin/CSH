// A small account service: the implementation the unit tests exercise.
export interface Account {
  balanceMinor: number;
  minimumBalanceMinor: number;
  premium: boolean;
}

export type Outcome = "Accepted" | "Rejected";

export function withdraw(account: Account, amount: number): { account: Account; result: Outcome } {
  // Premium accounts may overdraw (see docs/design-notes.json). No vocabulary in the specification says so.
  const allowed = account.premium || account.balanceMinor - amount >= account.minimumBalanceMinor;
  if (!allowed) return { account, result: "Rejected" };
  return { account: { ...account, balanceMinor: account.balanceMinor - amount }, result: "Accepted" };
}
