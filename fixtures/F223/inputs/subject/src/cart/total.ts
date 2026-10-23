export interface Line { price: number; quantity: number }

export function priceLine(line: Line): number {
  return line.price * line.quantity;
}

export function computeTotal(lines: Line[]): number {
  return lines.reduce((sum, l) => sum + priceLine(l), 0);
}
