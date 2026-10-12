import { Cart } from "./cart.ts";

export const order = (c: Cart): number => c.total();
