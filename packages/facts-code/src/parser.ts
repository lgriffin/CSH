// The tree-sitter grammars, loaded as WebAssembly (stage 29). A grammar is loaded once per process, on first use, from
// the package that ships it, so the adapter sandbox needs read access to installed packages and nothing else. Parsing
// is pure: no grammar reads a file, the clock or the network.
//
// Trees live on the WebAssembly heap and are not garbage collected, so a tree is read inside a callback and freed when
// it returns: a node must not outlive the callback. One parser per language is kept for the life of the process.
import { createRequire } from "node:module";
import { Language, Parser, type Node } from "web-tree-sitter";

export type { Node };

/** The languages read through tree-sitter, by the name a module fact gives its language. */
export const GRAMMARS = { python: "tree-sitter-python", java: "tree-sitter-java", go: "tree-sitter-go", rust: "tree-sitter-rust" } as const;
export type GrammarLanguage = keyof typeof GRAMMARS;

const require = createRequire(import.meta.url);
let ready: Promise<void> | undefined;
const parsers = new Map<GrammarLanguage, Promise<Parser>>();

async function parserFor(language: GrammarLanguage): Promise<Parser> {
  let p = parsers.get(language);
  if (p === undefined) {
    p = (async () => {
      ready ??= Parser.init();
      await ready;
      const pkg = GRAMMARS[language];
      const parser = new Parser();
      parser.setLanguage(await Language.load(require.resolve(`${pkg}/${pkg}.wasm`)));
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
