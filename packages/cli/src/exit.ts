// How the bin scripts start and end (stage 64): output drained before the exit, quiet when the reader has gone.

export interface BinIo {
  out: (s: string) => void;
  err: (s: string) => void;
  cwd: string;
}

/**
 * Run a command as a process. A reader that closes the pipe early (`csh overview | head`) is not an error of the
 * command: the write fails with EPIPE, and the process ends with code 0, or the command's own once it has one, rather
 * than a stack trace. The process exits only once stdout has drained, since process.exit would cut piped output short
 * at the pipe's buffer.
 */
export async function main(name: string, command: (argv: string[], io: BinIo) => Promise<number>): Promise<void> {
  let code: number | undefined;
  for (const stream of [process.stdout, process.stderr]) {
    stream.on("error", (e: NodeJS.ErrnoException) => {
      if (e.code === "EPIPE") process.exit(code ?? 0);
      throw e;
    });
  }
  try {
    code = await command(process.argv.slice(2), { out: (s) => process.stdout.write(s), err: (s) => process.stderr.write(s), cwd: process.cwd() });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    process.stderr.write(`${name}: ${err.message}\n${debugging() ? `${err.stack ?? ""}\n` : "Set CSH_DEBUG=1 to see where it came from.\n"}`);
    code = 1;
  }
  const done = code;
  process.stdout.write("", () => process.exit(done));
}

/** CSH_DEBUG set to anything but empty or 0 prints the stack of an unexpected error. */
export function debugging(): boolean {
  const v = process.env.CSH_DEBUG;
  return v !== undefined && v !== "" && v !== "0";
}
