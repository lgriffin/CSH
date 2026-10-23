export function total(lines: number[]): number {
  return Math.round(lines.reduce((a, b) => a + b, 0) * 100) / 100;
}
