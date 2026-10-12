import { type Code, Level, type Loose } from "./codes.ts";

export const STATUS: Record<Code, number> = { not_found: 404, conflict: 409, invalid: 400 };

export const LABELS: Readonly<Record<Level, string>> = { [Level.Low]: "low", [Level.High]: "high" };

export const TITLES = { not_found: "Not found", conflict: "Conflict", invalid: "Invalid" } satisfies Record<Code, string>;

export const SOME: Partial<Record<Code, number>> = { not_found: 404 };

export const ANY: Record<string, number> = { teapot: 418 };

export const LOOSE: Record<Loose, number> = { known: 1 };

export const CAST: Record<Code, number> = {} as Record<Code, number>;

export const FROZEN: Record<Code, number> = { not_found: 404, conflict: 409, invalid: 400 } as const;
