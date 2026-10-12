# F153

Prevention in Rust ([15](../../docs/spec/15-assertion-ladder.md), section 4; stage 49). `src/error.rs` declares the
enum `ApiError` with variants `NotFound`, `Conflict` and `Invalid`, and five places that map it:

- `fn status` matches every variant by path and has no catch-all arm: total over `ApiError`;
- `fn partial` matches one variant and then `_`: not total;
- `fn named` matches two variants and binds the rest to a name, which catches every other variant: not total;
- `struct Mapper` and its `impl Mapper { fn code(...) }` match every variant: `Mapper` is total over `ApiError`;
- `fn other` matches the variants of another enum, `Level`, completely: total over `Level`, not over `ApiError`.

`R-R-1` is cited by the holding claim on `status`: L5.

The expected result was written from the documents before the fixture was first run.

Added after review of the first version: `impl ApiError` matches `self` by `Self::Variant` arms, read as `ApiError`;
`by_ref` matches through `&ApiError::Variant` and `c @ &ApiError::Variant` patterns. Both map `ApiError`. `Light` has
the same variants as `Level`: `bare` names variants with no path, and its parameter's type `Level` decides; `unattributed`
matches a call's result, so it is credited to neither.
