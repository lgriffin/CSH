import { add } from "./lib/money.ts";

export class Cart {
  items: number[] = [];
  total(): number {
    return this.items.reduce(add, 0);
  }
}
