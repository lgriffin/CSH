import { format } from "../core/format.ts";

export const pad = (s: string): string => ` ${s} `;
export const twice = (s: string): string => format(format(s));
