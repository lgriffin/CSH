import type { SourceFile } from "../ast/node.ts";

export class FormatSpan {
  readonly file: SourceFile;

  constructor(file: SourceFile) {
    this.file = file;
  }
}
