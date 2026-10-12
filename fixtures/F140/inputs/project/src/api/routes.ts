import type { Task } from "../domain/task.ts";

export function show(t: Task): string {
  return `${t.id} ${t.status}`;
}
