# Gate disposition requirements

The disposition table of the Authority tab ([05](../../../docs/spec/05-authority-and-ledger.md), section 6), one sentence
per row, in EARS form. Written as candidates for the owner of the gate (Anchor, harnesses and A3, section 8); none is
approved. Each sentence says what the gate does with one approved obligation.

The table's rows overlap: an obligation can be stale and violated, or self-approved and conflicting. The table does not
say which row wins. `src/gate.ts` decides by the order of its checks: conflicting first, then violated, then unknown or
stale, then self-approved needing review, and allow only when none of these applies. Each sentence below states that
order in its own condition, so exactly one sentence applies to any obligation and each can be read alone
(countermeasure C1 of [the gate's A3](../csh/a3/dispositions/a3.md)). The order, highest first, is the first row
(conflicting); the second and third (violated, separated by a valid waiver); the fourth and fifth (unknown, or
satisfied and stale, separated by the policy); the seventh (self-approved and needs review); and last the sixth
(allow).

| ID | Requirement |
| --- | --- |
| GATE-001 | IF an approved obligation is conflicting, THEN THE GATE SHALL block it in enforcing mode, and mark it for review, recommending block, in advisory mode, whatever its applicability and approval. |
| GATE-002 | IF an approved obligation is violated and no valid waiver is in scope, THEN THE GATE SHALL block it in enforcing mode, and mark it for review, recommending block, in advisory mode, whatever its applicability and approval. |
| GATE-003 | IF an approved obligation is violated and a valid, unexpired waiver is in scope, THEN THE GATE SHALL mark it waived, whatever its applicability and approval. |
| GATE-004 | IF an approved obligation is unknown, or is satisfied and stale, and its policy marks the intent critical, THEN THE GATE SHALL block it in enforcing mode, and mark it for review in advisory mode, whatever its approval. |
| GATE-005 | IF an approved obligation is unknown, or is satisfied and stale, and its policy does not mark the intent critical, THEN THE GATE SHALL mark it for review, whatever its approval. |
| GATE-006 | WHEN an approved obligation is satisfied and not stale, and is not both self-approved and in need of review, THE GATE SHALL allow it. |
| GATE-007 | IF an approved obligation is satisfied and not stale, and is self-approved and needs review, THEN THE GATE SHALL mark it for review. |
