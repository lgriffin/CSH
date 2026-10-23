# F191

A relative Markdown link names a file ([19](../../docs/spec/19-from-the-typescript-run.md), section 3; stage 63).

`src/format/README.md` links:

- `./rules.ts` and `../../docs/diagram.png`, which are missing, and the reference definition `./missing-ref.go`, which is
  missing too. These three are the dangling reference.
- `rulesmap.go#L10`, `../scanner/scanner.go` and `../../docs/overview.md "Overview"`, which resolve from the document's
  directory.
- `https://example.com/docs/rules.ts`, `/index.html` and `#usage`, which are not relative, and `../../docs/guide`, which
  has no extension: none is read.
- `./old%20rules.ts`, in a sentence that says it was removed: unchecked.
- `./ghost.ts` in inline code, `./fence.ts` in a fence, and `../../../outside.ts`, which leaves the repository: none is
  read.

The root `README.md` links two files that exist, so it is no dangling reference.

The root `GUIDE.md` links `./main.ts`, which is missing: a link from a root-level document names `main.ts` at the root,
not a bare name to look for elsewhere. Its link to `./src/format/README.md` resolves.

The expected result was written from the specification before the code.
