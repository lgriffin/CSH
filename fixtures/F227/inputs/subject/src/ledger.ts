export interface Entry {
  id: string;
  cents: number;
}

export class Ledger {
  private readonly entries = new Map<string, Entry>();

  record(e: Entry): void {
    if (e.cents < 0) throw new Error("negative amount");
    this.entries.set(e.id, e);
  }

  total(): number {
    let t = 0;
    for (const e of this.entries.values()) t += e.cents;
    return t;
  }
}
