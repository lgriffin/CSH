// Throwaway git repositories with throwaway signing keys, for the ledger fixtures.
// Every key generated here is test-only: it lives in a temporary GNUPGHOME that is
// deleted afterwards, and is named "(test-only)". Nothing here touches the real
// repository's keys, commits or csh/maintainers.json.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Identity, Maintainers, Role } from "@csh/ledger";

export interface TestRepo {
  dir: string;
  env: NodeJS.ProcessEnv;
  keys: Map<string, string>;
  git(...args: string[]): string;
  write(path: string, content: string): void;
  commit(message: string, signer: string | null): string;
  maintainers(names: string[], identities: Record<string, { kind: "person" | "agent"; roles: Role[] }>): Maintainers;
  dispose(): void;
}

export function gpgAvailable(): boolean {
  try {
    execFileSync("gpg", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Create a repository under `parent` (which must be inside the workspace so that "csl" resolves). */
export function createTestRepo(parent: string, identities: string[]): TestRepo {
  mkdirSync(parent, { recursive: true });
  const dir = mkdtempSync(join(parent, "repo-"));
  // gpg's agent socket path must be short, so the keyring goes under the system temp directory.
  const gnupg = mkdtempSync("/tmp/csh-gnupg-");
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GNUPGHOME: gnupg,
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "CSH test",
    GIT_AUTHOR_EMAIL: "csh-test@test.invalid",
    GIT_COMMITTER_NAME: "CSH test",
    GIT_COMMITTER_EMAIL: "csh-test@test.invalid",
    GIT_AUTHOR_DATE: "2026-10-03T12:00:00Z",
    GIT_COMMITTER_DATE: "2026-10-03T12:00:00Z",
  };
  const run = (cmd: string, args: string[]) => execFileSync(cmd, args, { cwd: dir, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const keys = new Map<string, string>();
  for (const name of identities) {
    run("gpg", ["--batch", "--pinentry-mode", "loopback", "--passphrase", "", "--quick-gen-key", `${name} (test-only) <${name}@test.invalid>`, "ed25519", "sign", "never"]);
    const listing = run("gpg", ["--batch", "--with-colons", "--list-secret-keys", `${name}@test.invalid`]);
    const fpr = listing.split("\n").find((l) => l.startsWith("fpr:"))?.split(":")[9];
    if (fpr === undefined) throw new Error(`no fingerprint for test key ${name}`);
    keys.set(name, fpr);
  }
  run("git", ["init", "-q", "-b", "main"]);
  run("git", ["config", "commit.gpgsign", "false"]);
  run("git", ["config", "gpg.program", "gpg"]);
  let tick = 0;
  return {
    dir,
    env,
    keys,
    git: (...args) => run("git", args),
    write(path, content) {
      const abs = join(dir, path);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, content);
    },
    commit(message, signer) {
      tick += 1;
      const date = `2026-10-03T12:${String(Math.floor(tick / 60)).padStart(2, "0")}:${String(tick % 60).padStart(2, "0")}Z`;
      env.GIT_AUTHOR_DATE = date;
      env.GIT_COMMITTER_DATE = date;
      run("git", ["add", "-A"]);
      const args = ["commit", "-q", "--allow-empty", "-m", message];
      if (signer !== null) {
        const k = keys.get(signer);
        if (k === undefined) throw new Error(`unknown signer ${signer}`);
        args.push(`-S${k}`);
      } else args.push("--no-gpg-sign");
      run("git", args);
      return run("git", ["rev-parse", "HEAD"]).trim();
    },
    maintainers(names, ids) {
      const identities: Identity[] = names.map((n) => ({ name: n, kind: ids[n]!.kind, keys: [keys.get(n)!], roles: ids[n]!.roles }));
      return { schema: "csh-maintainers/v1", identities };
    },
    dispose() {
      try {
        execFileSync("gpgconf", ["--kill", "gpg-agent"], { env, stdio: "ignore" });
      } catch {
        // No agent running.
      }
      rmSync(dir, { recursive: true, force: true });
      rmSync(gnupg, { recursive: true, force: true });
    },
  };
}
