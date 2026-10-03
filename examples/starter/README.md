# Starter

The smallest component the harness evaluates: one function, one probe, one sentence and one rule, at rung 3 of
[the ladder](../../README.md#the-ladder). Unlike the other examples it stands alone. Copy it out of the repository,
install the tool beside it, and replace the function with yours.

| File | What it is |
| --- | --- |
| `src/shipping.ts` | The function under evaluation: the shipping fee for an order total |
| `docs/requirements.md` | One requirement sentence in EARS form, SHIP-001 |
| `spec/shipping.csl.ts` | The vocabulary (one event, `Quote`), one rule citing SHIP-001, and the bindings |
| `test/shipping.test.ts` | Two unit tests, with a probe that records each call as a witness |
| `csh/component.json` | The two practices, the source each feeds, and the command that runs the tests |

## Install it outside the repository

From the root of a clone, after `pnpm install`. The packages are packed from the clone and never published
([ADR-32](../../docs/adr/ADR-32-local-only-distribution.md)); TypeScript, Z3 and Node's types come from the npm registry.

```sh
node packages/testkit/src/pack.ts /tmp/csh-packs
cp -r examples/starter /tmp/my-component
cd /tmp/my-component
npm install --save-dev --no-audit --no-fund /tmp/csh-packs/*.tgz
npx csh run
```

`csh run` runs the tests through the probe, reads the sentence, checks, and decides. It reports one obligation,
`FreeShippingFrom50`, unknown: no model says what `Quote` does, and nobody has approved its bindings. The first test
cites SHIP-001 and agrees with the rule. The second has no rule behind it, so it is listed as a gap. The run record is
stored under `.csh-cache/runs/`.

## Make it yours

1. Replace `src/shipping.ts` with your function, and `docs/requirements.md` with your sentences.
2. In `spec/shipping.csl.ts`, name your event, its arguments and its result, and write one rule that cites one sentence.
3. In the tests, point the probe at your function. Its mappers name the witness keys the bindings name.
4. Run `npx csh run`, then climb the ladder: a second practice, a model, approvals, and an A3.

## Containers it exercises

Checked against [the container diagram](../../docs/architecture/containers.mmd) and the commands this example runs
(`packages/testkit/test/triangle.test.ts`).

- `cli`: the `csh` command, installed from a tarball
- `kernel`: the model, canonical JSON and digests, under every command
- `emission`: the emission inside `csh run`
- `adapters`: the witness and EARS adapters, inside `csh run`
- `check`: the queries, the gap view and the report
- `gate`: the gate decision
- `run`: `csh run`: harness, sources, check, gate and the stored record
- `component`: `csh/component.json`, read by `csh run`
- `harness`: the probe in the unit tests, and the reporter
