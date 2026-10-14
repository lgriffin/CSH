export class Lock {
  attempts = 0;
  window = 60;
  locked = false;
  fail(): void {
    this.attempts += 1;
    if (this.attempts >= 3) this.locked = true;
  }
}
