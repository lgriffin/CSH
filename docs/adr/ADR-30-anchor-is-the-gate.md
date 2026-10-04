# ADR-30: The first real component is the gate's own disposition decision

Source: Anchor, harnesses and A3, sections 8 and 13 ([09](../spec/09-anchor-harness-a3.md)).

## Context

Both examples were written in order to be evaluated. The lockout example was designed to carry an off-by-one, and its
A3 was designed and then produced. A component and a run need one anchor whose answer nobody chose in advance.

## Decision

The anchor is the disposition decision in `packages/gate/src/gate.ts`. Its requirements are the disposition table of
the Authority tab, section 6, the sentences CSH-011 and CSH-013 and principle P9. Its tests are
`packages/gate/test/gate.test.ts`. A model, the sentences in EARS form and a probe are written as candidates; the
first run and an opened A3 skeleton are committed, and every judged section of that A3 is left to the owner.

## Alternatives

Grow the sign-in example into a fuller service with unlock and lock expiry. It reads better to a newcomer, but it is
still code written in order to be evaluated.

## Consequences

The project stays standalone: the anchor is its own source. A finding against the gate is a result, not a failure of
the stage, and `gate.ts` is not changed to make one go away. The lockout example stays as the teaching example and the
regression fixture for the A3 package.

## Status

Accepted. Decided by the owner on 3 October 2026. The owner later asked an agent to write the A3's judgments, which
stay candidate ([#13](https://github.com/lgriffin/CSH/issues/13), [A-68](../../ASSUMPTIONS.md)).
