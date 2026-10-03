// A caching solver port for incremental runs. The key is the query's content without its
// time budget; only definite answers are kept, so an unknown is always asked again.
// Authority tab, section 5: every run may be repeated with all caches discarded, and the
// incremental and full runs must give identical reports (fixture F64).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { canonicalJson, digestJson } from "@csh/kernel";
import type { CheckInput, CheckResult, SolverPort } from "@csh/solver";

export class SolverCache {
  readonly entries = new Map<string, CheckResult>();
  hits = 0;
  misses = 0;
  static load(path: string): SolverCache {
    const c = new SolverCache();
    if (existsSync(path)) {
      const data = JSON.parse(readFileSync(path, "utf8")) as { entries: Record<string, CheckResult> };
      for (const [k, v] of Object.entries(data.entries)) c.entries.set(k, v);
    }
    return c;
  }
  save(path: string): void {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${canonicalJson({ schema: "csh-solver-cache/v1", entries: Object.fromEntries(this.entries) })}\n`);
  }
}

export function cachingSolver(inner: SolverPort, cache: SolverCache): SolverPort {
  return {
    id: inner.id,
    async check(input: CheckInput): Promise<CheckResult> {
      const key = digestJson({ solver: inner.id, vocabulary: input.vocabulary, hard: input.hard, tracked: input.tracked });
      const hit = cache.entries.get(key);
      if (hit !== undefined) {
        cache.hits += 1;
        return structuredClone(hit);
      }
      cache.misses += 1;
      const r = await inner.check(input);
      if (r.status === "sat" || r.status === "unsat") cache.entries.set(key, structuredClone(r));
      return r;
    },
  };
}
