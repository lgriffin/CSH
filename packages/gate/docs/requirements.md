# Gate disposition requirements

The disposition table of the Authority tab ([05](../../../docs/spec/05-authority-and-ledger.md), section 6), one sentence
per row, in EARS form. Written as candidates for the owner of the gate (Anchor, harnesses and A3, section 8); none is
approved. Each sentence says what the gate does with one approved obligation.

| ID | Requirement |
| --- | --- |
| GATE-001 | IF an approved obligation is conflicting, THEN THE GATE SHALL block it in enforcing mode, and mark it for review, recommending block, in advisory mode. |
| GATE-002 | IF an approved obligation is violated and no valid waiver is in scope, THEN THE GATE SHALL block it in enforcing mode, and mark it for review, recommending block, in advisory mode. |
| GATE-003 | IF an approved obligation is violated and a valid, unexpired waiver is in scope, THEN THE GATE SHALL mark it waived. |
| GATE-004 | IF an approved obligation is unknown or stale and its policy marks the intent critical, THEN THE GATE SHALL block it in enforcing mode, and mark it for review in advisory mode. |
| GATE-005 | IF an approved obligation is unknown or stale and its policy does not mark the intent critical, THEN THE GATE SHALL mark it for review. |
| GATE-006 | WHEN an approved obligation is satisfied, THE GATE SHALL allow it. |
| GATE-007 | IF an approved obligation is self-approved and needs review, THEN THE GATE SHALL mark it for review. |
