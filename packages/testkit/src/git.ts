// Throwaway git repositories with throwaway signing keys, for the ledger fixtures.
// Every key generated here is test-only: it lives in a temporary GNUPGHOME that is
// deleted afterwards, and is named "(test-only)". Nothing here touches the real
// repository's keys, commits or csh/maintainers.json.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import type { Identity, Maintainers, Role } from "@csh/ledger";

export interface TestRepo {
  dir: string;
  env: NodeJS.ProcessEnv;
  keys: Map<string, string>;
  git(...args: string[]): string;
  write(path: string, content: string): void;
  commit(message: string, signer: string | null): string;
  maintainers(names: string[], identities: Record<string, { kind: "person" | "agent"; roles: Role[] }>): Maintainers;
  /** The public half of a test-only key, ASCII-armoured, as a maintainer would keep it in the repository. */
  publicKey(name: string): string;
  dispose(): void;
}

const runs = (cmd: string, args: string[]): boolean => {
  try {
    execFileSync(cmd, args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

/**
 * Git for Windows' own gpg, `usr/bin` beside its `mingw64/libexec/git-core`, when `git --exec-path` names one there
 * (stage 47): from PowerShell or cmd, gpg is on Git Bash's PATH alone.
 */
export function gitForWindowsGpgDir(gitExecPath: string, exists: (p: string) => boolean = existsSync): string | undefined {
  const dir = resolve(gitExecPath.trim(), "..", "..", "..", "usr", "bin");
  return exists(join(dir, "gpg.exe")) ? dir : undefined;
}

/** True when gpg runs; on Windows, Git for Windows' gpg is put on this process's PATH first when no other is on it. */
export function gpgAvailable(): boolean {
  if (runs("gpg", ["--version"])) return true;
  if (process.platform !== "win32") return false;
  let execPath: string;
  try {
    execPath = execFileSync("git", ["--exec-path"], { encoding: "utf8" });
  } catch {
    return false;
  }
  const dir = gitForWindowsGpgDir(execPath);
  if (dir === undefined) return false;
  process.env.PATH = `${dir}${delimiter}${process.env.PATH ?? ""}`;
  return runs("gpg", ["--version"]);
}

/**
 * A directory for a gpg home: under /tmp, since gpg's agent socket path must be short; on Windows, which has no /tmp
 * and no such limit, under the system temp directory.
 */
export const gpgHomeDir = (prefix: string): string => mkdtempSync(process.platform === "win32" ? join(tmpdir(), prefix) : `/tmp/${prefix}`);

/** A gpg home as GNUPGHOME names it: Git for Windows' gpg reads C:\\x\\y as /c/x/y. */
export const gpgHomeEnv = (dir: string): string => (process.platform === "win32" ? dir.replace(/^([A-Za-z]):/, (_, d: string) => `/${d.toLowerCase()}`).replace(/\\/g, "/") : dir);

/** Create a repository under `parent` (which must be inside the workspace so that "csl" resolves). */
export function createTestRepo(parent: string, identities: string[]): TestRepo {
  mkdirSync(parent, { recursive: true });
  const dir = mkdtempSync(join(parent, "repo-"));
  // gpg's agent socket path must be short, so the keyring goes under the system temp directory.
  const gnupg = gpgHomeDir("csh-gnupg-");
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GNUPGHOME: gpgHomeEnv(gnupg),
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
    publicKey(name) {
      return run("gpg", ["--batch", "--armor", "--export", keys.get(name)!]);
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
