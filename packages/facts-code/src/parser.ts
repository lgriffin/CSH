// The tree-sitter grammars, loaded as WebAssembly (stage 29). A grammar is loaded once per process, on first use, from
// the package that ships it, so the adapter sandbox needs read access to installed packages and nothing else. Parsing
// is pure: no grammar reads a file, the clock or the network. The npm package carries the grammars beside this file,
// in grammars/, so that installing it builds nothing (stage 76, A-272).
//
// Trees live on the WebAssembly heap and are not garbage collected, so a tree is read inside a callback and freed when
// it returns: a node must not outlive the callback. One parser per language is kept for the life of the process.
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { Language, Parser, type Node } from "web-tree-sitter";

export type { Node };

/** The languages read through tree-sitter, by the name a module fact gives its language. */
export const GRAMMARS = { python: "tree-sitter-python", java: "tree-sitter-java", go: "tree-sitter-go", rust: "tree-sitter-rust" } as const;
export type GrammarLanguage = keyof typeof GRAMMARS;

const require = createRequire(import.meta.url);
let ready: Promise<void> | undefined;

/** A grammar's WebAssembly file: the copy the npm package carries, else the one its own package ships. */
export function grammarFile(pkg: string): string {
  const carried = fileURLToPath(new URL(`./grammars/${pkg}.wasm`, import.meta.url));
  return existsSync(carried) ? carried : require.resolve(`${pkg}/${pkg}.wasm`);
}
const parsers = new Map<GrammarLanguage, Promise<Parser>>();

async function parserFor(language: GrammarLanguage): Promise<Parser> {
  let p = parsers.get(language);
  if (p === undefined) {
    p = (async () => {
      ready ??= Parser.init();
      await ready;
      const pkg = GRAMMARS[language];
      const parser = new Parser();
      parser.setLanguage(await Language.load(grammarFile(pkg)));
      return parser;
    })();
    parsers.set(language, p);
  }
  return p;
}

/**
 * Parse one file and read its tree. `read` runs synchronously on the root node and returns plain data; the tree is
 * freed when it returns, so no node may be kept.
 */
export async function parseWith<T>(language: GrammarLanguage, text: string, read: (root: Node) => T): Promise<T> {
  const tree = (await parserFor(language)).parse(text);
  if (tree === null) throw new Error(`the ${language} parser returned no tree`);
  try {
    return read(tree.rootNode);
  } finally {
    tree.delete();
  }
}

/** The 1-based line a node starts on. */
export const lineOf = (n: Node): number => n.startPosition.row + 1;
