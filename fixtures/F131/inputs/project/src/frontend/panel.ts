import type { Session } from "../core/session.ts";

export const label = (s: Session): string => s.id;
