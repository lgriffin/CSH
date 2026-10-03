# F94

A stage's committed report was edited after it was recorded, so its digest no longer matches the one in the stage's
run record. `csh a3 verify` reports the stage as `stage-mismatch`; it never hides it. Anchor, harnesses and A3,
section 5.7 ([09](../../docs/spec/09-anchor-harness-a3.md)); exit of stage 14.

The stage records and judgments are written in the first commit of stage 14, before the code, in the formats that stage defines.
