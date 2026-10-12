// The tree-sitter grammars, loaded as WebAssembly (stage 29). A grammar is loaded once per process, on first use, from
// the package that ships it, so the adapter sandbox needs read access to installed packages and nothing else. Parsing
// is pure: no grammar reads a file, the clock or the network.
import { createRequire } from "node:module";
import { Language, Parser, type Node } from "web-tree-sitter";

export type { Node };

/** The languages read through tree-sitter, by the name a module fact gives its language. */
export const GRAMMARS = { python: "tree-sitter-python", java: "tree-sitter-java", go: "tree-sitter-go", rust: "tree-sitter-rust" } as const;
export type GrammarLanguage = keyof typeof GRAMMARS;

const require = createRequire(import.meta.url);
let ready: Promise<void> | undefined;
const languages = new Map<GrammarLanguage, Promise<Language>>();

/** A parser for one language, its grammar loaded. */
export async function parserFor(language: GrammarLanguage): Promise<Parser> {
  ready ??= Parser.init();
  await ready;
  let lang = languages.get(language);
  if (lang === undefined) {
    const pkg = GRAMMARS[language];
    lang = Language.load(require.resolve(`${pkg}/${pkg}.wasm`));
    languages.set(language, lang);
  }
  const parser = new Parser();
  parser.setLanguage(await lang);
  return parser;
}

/** The tree of one file: its root node, and the 1-based line a node starts on. */
export async function parse(language: GrammarLanguage, text: string): Promise<Node> {
  const tree = (await parserFor(language)).parse(text);
  if (tree === null) throw new Error(`the ${language} parser returned no tree`);
  return tree.rootNode;
}

export const lineOf = (n: Node): number => n.startPosition.row + 1;
