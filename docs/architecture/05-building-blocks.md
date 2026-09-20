# 5. Building blocks

## Level 1 — the layer cake

Dependencies point downward only. The boundary between L2 and L3 is where
platform dependencies become permissible.

```
L5  themes                       CSS only. Nothing depends on these.
    ├─ blueprint.css             light, technical, invalid = leading bar
    └─ dusk.css                  dark, rounded, invalid = ring
─────────────────────────────────────────────────────────────────────
L4  unstyled component kits      semantic HTML, zero CSS, a11y-correct
─────────────────────────────────────────────────────────────────────
L3  react            angular     reactivity adapter · registry · focus
─────────────────────────────────────────────────────────────────────
L2  core                         the engine — no framework, no DOM, no Node
─────────────────────────────────────────────────────────────────────
L1  expressions                  CEL parse · check · compile · evaluate · policy
─────────────────────────────────────────────────────────────────────
L0  spec                         types · JSON Schema · diff · canonical hash

    builder-core                 sits beside L2: depends on spec only
    conformance                  sits beside L2: depends on spec only
    server-core                  depends on core and spec; no HTTP types
    server                       Fastify routes, PostgreSQL, auth runtime
```

The rule that everything below L3 has no platform dependency is enforced by the
type system rather than by a lint rule: those packages have no `@types/node`,
so a Node import is a compile error ([0008](../decisions/0008-layered-packages.md)).

## Level 2 — inside each package

### `@formancy/spec` (L0)

The data contract, and nothing that evaluates it.

| Module | Responsibility |
|---|---|
| `types.ts` | The document's TypeScript shape |
| `formancy.schema.json` | JSON Schema 2020-12. Every property carries a title and description, enforced by a test |
| `validate.ts` | Structural validation via a precompiled ajv validator, then semantic rules ajv cannot express: duplicate keys, rename legality, nested repeaters, pages below top level, uncompilable patterns, logic targets, unresolvable message references |
| `canonical.ts` | Deterministic serialisation. **Throws** rather than dropping undefined, NaN or Infinity ([0010](../decisions/0010-canonical-hash.md)) |
| `hash.ts` | sha256 over the canonical form, via `@noble/hashes` because the builder hashes in a browser |
| `diff.ts` | `diffSchemas` over **data paths**, classifying compatible / lossy / breaking ([0015](../decisions/0015-diff-before-server.md)) |
| `paths.ts` | The single walk of the model that everything else agrees with |
| `presentation.ts` | Message-reference resolution and layout path checks ([0014](../decisions/0014-presentation-sections.md)) |
| `generated/document-validator.js` | The ahead-of-time ajv artefact, stamped with the schema hash so staleness is detectable ([0040](../decisions/0040-no-eval.md)) |

### `@formancy/expressions` (L1)

formancy's own facade over CEL. Nothing above this layer imports the CEL
library ([0017](../decisions/0017-expression-facade.md)).

`parse` · `check` · `compile` · `evaluate` are the surface. Around them sit the
things a thin pass-through would have nowhere to put: `limits.ts` (AST size and
depth), `budget.ts` (per-expression and per-submission wall-clock), `kinds.ts`
(the function allow-list per expression slot, so a `visible` expression cannot
perform a lookup), `capabilities.ts` (the injected clock and randomness),
`references.ts` (the static variable extraction the dependency graph needs) and
`decimal.ts` (scaled-integer money, so `price * 0.19` is a type error and
`price * dec("0.19")` is required).

### `@formancy/core` (L2)

| Module | Responsibility |
|---|---|
| `engine.ts` | `createFormEngine`. The model walk, logic compilation, snapshot construction and caching, validation, submit |
| `graph.ts` | The dependency DAG, topologically sorted, cycle-checked |
| `store.ts` | Path-addressed value storage with change tracking |
| `path.ts` / `value.ts` | Parsing, formatting and traversal of data paths |
| `props.ts` | Every ARIA attribute, composed centrally ([0021](../decisions/0021-engine-owns-aria.md)) |
| `ids.ts` | Deterministic, SSR-stable element ids |
| `model-validators.ts` | min, max, lengths, anchored patterns, and formats as explicit regular expressions because `URL` is unavailable |
| `interaction.ts` | Touched state, which decides when a message is shown |
| `wizard.ts` | Page navigation and per-page validation semantics |
| `strip.ts` | `clearOnHide` pruning, applied identically on client and server |

### `@formancy/react` and `@formancy/angular` (L3)

Deliberately small, and structurally parallel:

| Concern | React | Angular |
|---|---|---|
| Reactivity | `useSyncExternalStore` over the engine's snapshots | signals, zoneless, `OnPush` |
| Field binding | `use-field.ts` | `field.ts` |
| Repeater | `use-repeater.ts` | `repeater.ts` |
| Wizard | `use-wizard.ts` | `wizard.ts` |
| Component resolution | `context.tsx` | `registry.ts`, `provide.ts` |
| Default controls | `form.tsx` | `fields.ts` |
| Error summary | `error-summary.tsx` | `error-summary.ts` |
| Conformance driver | `conformance-driver.tsx` | `conformance-driver.ts` |

Neither contains a CSS file. Both resolve labels through the engine rather than
reading `def.label`, so they cannot disagree about what a field is called.

### `@formancy/builder-core`

`createBuilderSession` applies a command to a *copy* of the document, validates
the result, and commits only if it is legal. `validTargets` decides whether an
edit is permitted by **attempting it**, which is how the spec's missing
prohibition on nested pages was found. A rename declares `renamedFrom` against
the session baseline rather than the previous edit, so three renames in one
session produce one declaration rather than a chain
([0011](../decisions/0011-declared-renames.md)).

### `@formancy/conformance`

Published to npm so third-party renderers can self-certify
([0035](../decisions/0035-publish-the-suite.md)). `driver.ts` is the interface,
`runner.ts` executes a fixture against it, `validate.ts` refuses a fixture that
could not run honestly — including one whose field has no resolvable accessible
name — and `builtin-fixtures.ts` is generated from `fixtures/*.json` with the
case list pinned in a test, so a case that silently stopped being embedded is
caught.

### `@formancy/server-core` and `@formancy/server`

`server-core` holds the use cases — publish, resolve, submit with replay, list,
export, save and resume drafts, authenticate, authorise — and contains **no
HTTP types at all**. Storage arrives through a ports interface, which also
gives the tests an in-memory implementation.

`server` holds Fastify routes in two planes, the PostgreSQL adapter, the schema
including the immutability trigger, and the auth runtime (argon2id via
`@node-rs/argon2`, sessions via `jose`).

The webhook outbox shows the split at its sharpest. `server-core/outbox.ts` has
`afterAttempt` — pure, four arguments, the entire retry policy — and
`drainOutbox`, one batch that returns. `server/deliver.ts` has the part that
cannot be isomorphic: `node:dns`, an undici agent pinned to the address that
was checked, and a `URL`. `server/outbox-worker.ts` is the clock and nothing
else, which is why it fits on one screen. The address *classification* sits
back in `server-core/address.ts`, because deciding whether `::ffff:10.0.0.5` is
private needs no runtime at all — only parsing it into a `URL` does, and that
is why `webhookUrlProblem` lives in `server` while `isPrivateAddress` does
not.
