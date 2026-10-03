// Test identity (A-39): the test file relative to the directory the harness runs in, then "::", then the test's full
// name as Node's test runner gives it, the names of the enclosing tests joined by " > ".
import { isAbsolute, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

export function testIdentity(file: string | undefined, fullName: string, cwd = process.cwd()): string {
  if (file === undefined || file === "") return fullName;
  const path = file.startsWith("file:") ? fileURLToPath(file) : file;
  const rel = isAbsolute(path) ? relative(cwd, path) : path;
  return `${rel.split(sep).join("/")}::${fullName}`;
}
