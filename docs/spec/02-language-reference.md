# Language reference

CSL is a TypeScript library whose functions build the model defined in the Semantic contract tab; this tab specifies that library's surface, how a module is emitted, and how the model is printed back. It is stage 2 of the path. All signatures are proposed and have not been compiled.

## 1. Principles of the surface

- Every function returns data or registers data. Nothing evaluates a predicate against real values.
- Expression handles are opaque objects. They have no `valueOf` that yields a number, so arithmetic or comparison with native operators fails to type-check.
- Callbacks such as `shall: ({ result }) => ...` run exactly once, during emission, with symbolic handles.
- Names are data: every state, event, obligation and example is given an explicit string name, which is the name in the model.

## 2. Types and units

```ts
// A unit is a function that makes literals of that unit.
declare function unit<D extends string, S extends string>(
  dimension: D, symbol: S,
): UnitFn<`${D}(${S})`>;

interface UnitFn<U extends string> {
  (value: number | bigint): Int<U, never>;   // number must be a safe integer
  readonly id: U;
}

// Type descriptors used in state fields, event args and returns.
declare function int<U extends string>(unit: UnitFn<U>): IntType<U>;
declare function int(): IntType<undefined>;
declare function bool(): BoolType;
// Enumerations are declared on the system builder and are their own descriptor.
```

Units are compared by their literal type. `Int<"minor(EUR)">` and `Int<"minor(USD)">` are different types, so mixing them is a compile error (rule S2).

## 3. Expression handles

Each handle carries two type parameters: its value type and a **phase** tag recording which references it contains.

```ts
type Phase = "now" | "pre" | "post" | "arg" | "result";

interface Int<U extends string | undefined, P extends Phase> {
  plus<Q extends Phase>(x: Int<U, Q>): Int<U, P | Q>;
  minus<Q extends Phase>(x: Int<U, Q>): Int<U, P | Q>;
  eq<Q extends Phase>(x: Int<U, Q>): Bool<P | Q>;
  ne<Q extends Phase>(x: Int<U, Q>): Bool<P | Q>;
  lt<Q extends Phase>(x: Int<U, Q>): Bool<P | Q>;
  lte<Q extends Phase>(x: Int<U, Q>): Bool<P | Q>;
  gt<Q extends Phase>(x: Int<U, Q>): Bool<P | Q>;
  gte<Q extends Phase>(x: Int<U, Q>): Bool<P | Q>;
}

interface Bool<P extends Phase> {
  and<Q extends Phase>(x: Bool<Q>): Bool<P | Q>;
  or<Q extends Phase>(x: Bool<Q>): Bool<P | Q>;
  not(): Bool<P>;
  implies<Q extends Phase>(x: Bool<Q>): Bool<P | Q>;
  eq<Q extends Phase>(x: Bool<Q>): Bool<P | Q>;
}

interface EnumValue<N extends string, P extends Phase> {
  eq<Q extends Phase>(x: EnumValue<N, Q>): Bool<P | Q>;
  ne<Q extends Phase>(x: EnumValue<N, Q>): Bool<P | Q>;
}

declare function and<P extends Phase>(...xs: Bool<P>[]): Bool<P>;
declare function or<P extends Phase>(...xs: Bool<P>[]): Bool<P>;
declare function not<P extends Phase>(x: Bool<P>): Bool<P>;
```

Builders accept only the phases the Semantic contract allows in that position. For example an invariant body is `Bool<"now">`, so a post-state reference there is a compile error (rule S3).

| Method | Model node |
| --- | --- |
| `plus`, `minus` | `add`, `sub` |
| `eq`, `ne`, `lt`, `lte`, `gt`, `gte` | `eq`, `ne`, `lt`, `le`, `gt`, `ge` |
| `and`, `or`, `not`, `implies` | `and`, `or`, `not`, `implies` |
| `x.and(y)` | `and` with two operands; the function form `and(a, b, c)` gives one node with three |

## 4. The system builder

```ts
declare function system(name: string, build: (s: SystemBuilder) => void): Module;

interface SystemBuilder {
  enum<N extends string, M extends string>(
    name: N, members: readonly M[],
  ): EnumType<N> & { readonly [K in M]: EnumValue<N, never> };

  state<N extends string, F extends Fields>(name: N, fields: F): StateRef<N, F>;
  // StateRef<N, F> exposes each field as a handle at phase "now":
  //   Account.balance : Int<"minor(EUR)", "now">

  event<N extends string, S extends StateRef<any, any>, A extends Fields, R extends TypeDesc>(
    name: N, spec: { on: S; args: A; returns?: R },
  ): EventRef<N, S, A, R>;
  // EventRef is callable to build an example call:  Withdraw({ amount: EUR(10000) })
  // EventRef.args exposes each argument at phase "arg": Withdraw.args.amount
  // EventRef.result exposes the result at phase "result" (used as a binding target)

  transition<E extends EventRef<any, any, any, any>>(
    event: E,
    body: (h: StepHandles<E>) => {
      when: Bool<"pre" | "arg">;
      then: Bool<"pre" | "post" | "arg" | "result">;
      otherwise?: Bool<"pre" | "post" | "arg" | "result">;
    },
  ): void;

  policy(name: string, spec: { require: Method[]; reject?: Rejection[] }): void;

  intent(
    name: string,
    meta: { owner: string; value: string; assurance: string },
    build: (i: ClaimBuilder) => void,
  ): void;

  source(name: string, spec: { kind: string; at: string }): SourceRef;
  claims(source: SourceRef, build: (c: ClaimBuilder) => void): void;

  bind(target: FieldHandle | ArgHandle | ResultHandle, key: string): void;

  use(pack: Pack): void;      // stage 8; a pack carries its own name, version and digest
}

interface StepHandles<E> {
  pre: StateAt<E, "pre">;     // pre.balance : Int<U, "pre">
  post: StateAt<E, "post">;
  args: ArgsOf<E>;            // args.amount : Int<U, "arg">
  result: ResultOf<E>;        // phase "result"
}

interface ClaimBuilder {
  assume(name: string, body: Bool<"now" | "arg">): void;
  invariant(name: string, body: Bool<"now">, opts?: Cites): void;
  requirement<E extends EventRef<any, any, any, any>>(name: string, spec: {
    when: E;
    while?: (h: Pick<StepHandles<E>, "pre">) => Bool<"pre">;
    and?: (h: Pick<StepHandles<E>, "pre" | "args">) => Bool<"pre" | "arg">;
    shall: (h: StepHandles<E>) => Bool<Phase>;
    ensures?: (h: StepHandles<E>) => Bool<Phase> | Bool<Phase>[];
    cites?: { source: SourceRef; id: string }[];
  }): void;
  example<E extends EventRef<any, any, any, any>>(name: string, spec: {
    given: Partial<LiteralsOf<StateOf<E>>>;
    when: EventCall<E>;
    then: (h: StepHandles<E>) => Bool<Phase>;
    cites?: { source: SourceRef; id: string }[];
  }): void;
}
```

The exact generic machinery is the implementer's to refine. What is fixed is the behaviour: the compile-time fixtures F01 to F04 and F09 must fail to compile, each with an `@ts-expect-error` test, and F10 must compile.

## 5. EARS words

Requirement fields keep the EARS words exactly (D16).

| EARS pattern | Sentence shape | Fields used |
| --- | --- | --- |
| Ubiquitous | The system shall ... | An `invariant`, or a requirement with `when` and `shall` only |
| Event-driven | When trigger, the system shall ... | `when`, `shall` |
| State-driven | While state, the system shall ... | `while`, `when`, `shall` |
| Unwanted behaviour | If condition, then the system shall ... | `when`, `and`, `shall` |
| Complex | While state, when trigger, the system shall ... | `while`, `when`, `and`, `shall` |
| Optional feature | Where feature, the system shall ... | Not in version 1; lifted as unliftable with reason feature-scope |

`ensures` is the one addition to EARS: it states what else must be true afterwards, such as a value left unchanged.

## 6. Naming

- State, event, enumeration, intent, obligation, example and policy names match `^[A-Z][A-Za-z0-9]*$`.
- Field and argument names match `^[a-z][A-Za-z0-9]*$`.
- Names are unique within their kind and their container. A duplicate fails emission with E-DUP.
- The qualified name of a fragment is `System/Intent/Name` for intents and `System/@Source/Name` for claims. Ledger entries use qualified names.

## 7. Emission

`csl emit <file>` turns a module into a model.

1. Type-check the file with the TypeScript compiler in strict mode. Any error stops here.
2. Start a subprocess with file access limited to the specification root and installed packs, and with network, environment variables, child processes and workers denied (D14).
3. In the subprocess, replace `Date`, `Math.random`, `performance` and timers with functions that throw E-ACCESS.
4. Import the module. Its default export must be the value returned by `system(...)`, else E-EXPORT.
5. Run the checks on the model: S6, S7, S8, the phase table, and naming.
6. Write canonical JSON and the module digest.
7. Repeat steps 2 to 6 in a fresh subprocess and compare digests. A difference is S9.

| Error | Cause |
| --- | --- |
| E-ACCESS | The module touched a denied capability |
| E-EXPORT | The default export is not a module built by `system` |
| E-DUP | Two declarations share a name |
| E-INT | A unit literal was given a number that is not a safe integer; use a bigint |
| S6 to S9 | As in the main tab, section 7.3 |

Loops, helpers and imports of other specification files are allowed. They are ordinary TypeScript, and what counts is the model that comes out.

## 8. Canonical printer

`csl print <model.json>` renders any model as CSL TypeScript. It is how lifted claims and loop-generated obligations are shown for review.

- Declarations appear in canonical order: units, enumerations, states, events, transitions, policies, intents, sources, claims, bindings.
- Each declaration is bound to a `const` named after it. Field access uses the handle (`pre.balance`), never a string.
- Binary nodes print as method calls; `and` and `or` with more than two operands print in function form.
- Integer literals print through their unit function; values beyond the safe range print with a bigint suffix.
- Output is formatted with fixed rules (two spaces, one clause per line) and contains no comments.

Round-trip property, tested on every fixture: emitting the printed text gives a model with the same digest.

## 9. Claims in the language

```ts
const LedgerModel = s.source("LedgerModel", { kind: "Model", at: "spec/account.csl.ts" });
const UnitTests = s.source("UnitTests", { kind: "Witnesses", at: "reports/witness.ndjson" });

s.claims(UnitTests, (c) => {
  c.example("AcceptsWithdrawal", {
    given: { balance: EUR(5000), floor: EUR(0) },
    when: Withdraw({ amount: EUR(10000) }),
    then: ({ post, result }) =>
      and(
        result.eq(Outcome.Accepted),
        post.balance.eq(EUR(-5000)),
        post.floor.eq(EUR(0)),
      ),
  });
});
```

Adapters normally produce the equivalent JSON directly; this form is what the printer shows.

## 10. Packs (stage 8)

A pack is a package that exports vocabulary and obligations for reuse, with a name, a version and a digest of its emitted model. `s.use(pack)` merges it under the composition rules in the main tab, section 6.3. The lock file records each pack's digest; a digest that differs from the lock fails with S8.
