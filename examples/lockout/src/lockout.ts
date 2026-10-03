// A small sign-in service: the implementation the unit tests exercise, written test first.
export const MAX_FAILED_ATTEMPTS = 3;
export const LOCK_SECONDS = 15 * 60;

export interface Login {
  failedAttempts: number;
  locked: boolean;
  lockSeconds: number;
}

export type Outcome = "Accepted" | "Refused";

export function signIn(login: Login, passwordOk: boolean): { login: Login; result: Outcome } {
  if (login.locked) return { login, result: "Refused" };
  if (passwordOk) return { login: { ...login, failedAttempts: 0 }, result: "Accepted" };
  const failedAttempts = login.failedAttempts + 1;
  // "Three failed attempts" read as three allowed: the lock comes with the attempt after them.
  const locked = failedAttempts > MAX_FAILED_ATTEMPTS;
  return { login: { failedAttempts, locked, lockSeconds: locked ? LOCK_SECONDS : 0 }, result: "Refused" };
}
