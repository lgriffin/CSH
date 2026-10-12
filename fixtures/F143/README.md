# F143

Prevention in Rust ([14](../../docs/spec/14-assertion-ladder.md), section 4; stage 47). `src/error.rs` declares the
enum `ApiError` with variants `NotFound`, `Conflict` and `Invalid`, and five places that map it:

- `fn status` matches every variant by path and has no catch-all arm: total over `ApiError`;
- `fn partial` matches one variant and then `_`: not total;
- `fn named` matches two variants and binds the rest to a name, which catches every other variant: not total;
- `struct Mapper` and its `impl Mapper { fn code(...) }` match every variant: `Mapper` is total over `ApiError`;
- `fn other` matches the variants of another enum, `Level`, completely: total over `Level`, not over `ApiError`.

`R-R-1` is cited by the holding claim on `status`: L5.

The expected result was written from the documents before the fixture was first run.
