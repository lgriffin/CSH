// The board: cards by column.
import { NOT_FOUND } from "../http/status.ts";

export function move(cards: string[], card: string): number {
  return cards.includes(card) ? 0 : NOT_FOUND;
}
