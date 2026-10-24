export function applyDiscount(total: number, code: string): number {
  return code === "TENOFF" ? total * 0.9 : total;
}
