import type { Session } from "../core/session.ts";
import { format } from "../core/format.ts";

export const title = (s: Session): string => format(s.id);
