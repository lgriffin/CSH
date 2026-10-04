# F102

An undrawn dependency: `core` imports `db` at `packages/core/src/orders.ts:3`, and the diagram draws no relation from the
`core` container to the `db` container. The gap `undrawn-dependency` names the pair of containers. `DiagramIsComplete`
(`closed(C4)`) is a candidate, so the gap stays a gap; the rule's own verdict is `violated`, which carries no weight
until someone approves it (A-73). Next layers, section 4.3 and 9; exit of stage 18.

The fixture is written before the code of its stage, from [10](../../docs/spec/10-next-layers.md); the runner reports it as pending until that stage is built.
