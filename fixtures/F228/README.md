# F228

Requirements written as list items ([22](../../docs/spec/22-analysis-a3-and-1.0.md), section 1; stage 77; A-276). Many
TypeScript repositories keep requirements as a bulleted list rather than as headings or table rows.

- `- **REQ-1** The client shall ...` and `* REQ-2: The client must ...` each define a requirement: a list item that
  opens with an identifier, bold or not, and says shall or must. Nothing cites either, so each is `unverified`.
- `- REQ-3 describes the backoff ...` says neither shall nor must, so it defines nothing.
- `REQ-4` is a heading, as before; the bullets under it stay its fields, not requirements of their own.
- The README's `- See REQ-1 ...` does not open with an identifier, and mentions `REQ-1`, which exists.

The expected result was written from the specification before the code existed.
