// Which language a file of a Code source is written in, by its extension (stage 29). TypeScript and JavaScript are read
// by facts-ts, and every other language with a reader by that reader; a source file in a language CSH knows of but has
// no reader for is a skipped fact, so a rule or claim about it is indeterminate rather than silently empty.

/** Source languages other than TypeScript and JavaScript, by extension. A file with none of these is not code to CSH. */
const LANGUAGES: Record<string, string> = {
  py: "python",
  pyi: "python",
  java: "java",
  go: "go",
  rs: "rust",
  c: "c",
  h: "c",
  cc: "c++",
  cpp: "c++",
  cxx: "c++",
  hpp: "c++",
  cs: "c#",
  kt: "kotlin",
  kts: "kotlin",
  scala: "scala",
  groovy: "groovy",
  rb: "ruby",
  php: "php",
  swift: "swift",
  m: "objective-c",
  mm: "objective-c",
  dart: "dart",
  lua: "lua",
  ex: "elixir",
  exs: "elixir",
  erl: "erlang",
  hs: "haskell",
  clj: "clojure",
  ml: "ocaml",
  fs: "f#",
  jl: "julia",
  zig: "zig",
};

const extensionOf = (path: string): string => {
  const base = path.slice(path.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot <= 0 ? "" : base.slice(dot + 1);
};

/** The language a source file is written in, or undefined for TypeScript, JavaScript and files that are not code. */
export function languageOf(path: string): string | undefined {
  return Object.hasOwn(LANGUAGES, extensionOf(path)) ? LANGUAGES[extensionOf(path)] : undefined;
}
