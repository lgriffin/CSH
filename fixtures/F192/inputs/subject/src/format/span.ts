import type { SourceFile } from "../ast/node.ts";

export class FormatSpan {
  constructor(readonly file: SourceFile) {}
}
