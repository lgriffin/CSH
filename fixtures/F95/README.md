# F95

The intent owner approves the digest of an A3's judgments through the ledger, by signed commit with a test-only key,
and the sheet's authority is approved (self-approved, with one person listed). The judgments are then edited and
committed unsigned: the digest changes, and the sheet returns to candidate. Anchor, harnesses and A3, section 5.6
([09](../../docs/spec/09-anchor-harness-a3.md)); [ADR-31](../../docs/adr/ADR-31-a3-judgments-through-the-ledger.md);
exit of stage 14.

The stage records and judgments are written in the first commit of stage 14, before the code, in the formats that stage defines.
