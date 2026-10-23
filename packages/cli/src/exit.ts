// How the bin scripts start and end (stage 64): output drained before the exit, quiet when the reader has gone.

export interface BinIo {
  out: (s: string) => void;
  err: (s: string) => void;
  cwd: string;
}

/**
 * Run a command as a process. A reader that closes the pipe early (`csh overview | head`) is not an error of the
 * command: once a write fails with EPIPE, later output is dropped and the command runs to its end, so the process
 * exits with the command's own code (a gate that blocks still exits 1) rather than a stack trace or a premature 0. The
 * process exits only once stdout has drained, since process.exit would cut piped output short at the pipe's buffer.
 */
export async function main(name: string, command: (argv: string[], io: BinIo) => Promise<number>): Promise<void> {
  const closed = { out: false, err: false };
  for (const [k, stream] of [["out", process.stdout], ["err", process.stderr]] as const) {
    stream.on("error", (e: NodeJS.ErrnoException) => {
      if (e.code !== "EPIPE") throw e;
      closed[k] = true;
    });
  }
  const write = (k: "out" | "err", s: string) => {
    if (!closed[k]) (k === "out" ? process.stdout : process.stderr).write(s);
  };
  let code: number;
  try {
    code = await command(process.argv.slice(2), { out: (s) => write("out", s), err: (s) => write("err", s), cwd: process.cwd() });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    write("err", `${name}: ${err.message}\n${debugging() ? `${err.stack ?? ""}\n` : "Set CSH_DEBUG=1 to see where it came from.\n"}`);
    code = 1;
  }
  if (closed.out) process.exit(code);
  process.stdout.write("", () => process.exit(code));
}

/** CSH_DEBUG set to anything but empty or 0 prints the stack of an unexpected error. */
export function debugging(): boolean {
  const v = process.env.CSH_DEBUG;
  return v !== undefined && v !== "" && v !== "0";
}
