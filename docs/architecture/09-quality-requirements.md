# 9. Quality requirements

Each requirement here is stated so that it can fail. A quality goal that cannot
be measured is a preference.

## 9.1 Quality tree

```
formancy
├── Correctness
│   ├── client and server never disagree          ← goal 1
│   ├── a submission joins to its exact schema    ← goal 2
│   └── both renderers behave identically
├── Safety
│   ├── a form that could loop is never saved
│   ├── expressions terminate
│   └── data is never silently lost
├── Accessibility
│   ├── every control reachable by role and name
│   └── zero axe violations
├── Performance
│   ├── keystroke latency
│   └── cold graph compilation
└── Maintainability
    ├── layer boundaries hold
    └── a contributor understands the repo in ten minutes
```

## 9.2 Scenarios, with how each is verified

| # | Scenario | Measure | Status |
|---|---|---|---|
| Q1 | A client is modified to skip validation and posts directly to the API | The submission is rejected with the same errors the client would have produced | Integration test against real PostgreSQL |
| Q2 | A payload carries a value in a branch the server considers hidden | The stored row does not contain it | Integration test |
| Q3 | The same fixture runs through React and Angular | Identical observable behaviour, **no framework-specific skips** | Conformance suite, both drivers |
| Q4 | A form defines a dependency cycle | Refused at save time with a trace; never persisted | Unit tests in `core` |
| Q5 | A field is hidden and then shown again | The value returns if and only if `clearOnHide` is `false` | Property-based test, `fast-check` |
| Q6 | A repeater row is added then removed | The value is identical to before | Property-based test |
| Q7 | A published version is updated by any path into the database | The write is rejected | Database trigger; integration test |
| Q8 | A keystroke on a form of 500 fields with 200 conditionals | **< 1 ms** | Measured **≈0.38 ms** |
| Q9 | Cold graph compilation for the same form | **< 30 ms** | Measured **≈1.7 ms** |
| Q10 | A renderer emits markup that a screen reader cannot navigate | The conformance suite cannot drive it, so it fails | Structural, by [0034](../decisions/0034-accessible-name-only.md) |
| Q11 | Any mount, and any DOM-mutating state change | Zero axe-core violations | In the conformance run |
| Q12 | A package is published with a broken exports map | `publint` and `attw` fail the build | `pnpm check:pkg` |
| Q13 | An isomorphic package acquires a Node dependency | Typecheck fails, because there is no `@types/node` | `pnpm typecheck` |
| Q14 | The expression evaluator regresses against the CEL specification | The pinned corpus counts change and the test fails | [0036](../decisions/0036-pin-the-cel-corpus.md) |

## 9.3 Budgets

| Budget | Limit | Actual |
|---|---|---|
| Keystroke, large conditional form | 1 ms | ≈0.38 ms |
| Cold graph compile | 30 ms | ≈1.7 ms |
| `@formancy/core` bundle | 18 kB brotli | 15.0 kB, measured 2026-09-28 |
| `@formancy/spec` bundle | — | 9.6 kB, measured 2026-09-28 |
| `@formancy/react` bundle | 4 kB brotli | **17.5 kB** for the whole barrel, measured 2026-09-28 |
| `uqr`, the QR encoder | — | 6.6 kB brotli, **external** rather than bundled, measured 2026-09-27 |

The performance gate is written to fail on a regression greater than 15%,
which converts "fast on large conditional forms" from a claim into a test.

**There is no bundle gate, and this column said "gate configured".** Nothing in the
repository runs `size-limit` — [0038](../decisions/0038-esm-only.md) says so plainly in
its *Verified by* line, and three other documents said the opposite, including the
regulatory evidence table. The figures above are `brotliCompressSync` over each built
`dist/index.mjs`, dated because they are re-measured rather than incremented.

**The React figure needs reading carefully rather than reporting as a breach.** 4 kB was
written for a tree-shaken entry — the design is per-entry `exports` so that
`@formancy/react/fields/date` pulls only what it needs — and 17.5 kB is the *whole barrel*,
every field type, the error summary, the resume notice and the wizard included. Those are
not the same number, and which one the budget meant cannot be settled without running a
bundler over a realistic import, which nothing here does.

**The React figure moves when a control is added, and it has three times in a day.**
13.2 kB before `widget: "typeahead"`, 14.8 kB after it, 16.2 kB after
`widget: "datagrid"`, and 17.6 kB after `optionsSource` — which is not a control at all
but the async lifecycle behind two of them: debouncing, superseding by abort, naming a
stored answer, and one status region. Each is in the barrel because each is the control
for a type somebody already uses.

It also moves when the SOURCE does. Stripping the decision essays out of the comments took
it from 17.7 to 17.5 kB, which is the guard catching a change nobody thought was a change
to the bundle.

The figure is re-measured rather than incremented, which is what `apps/docs/src/bundles.test.ts`
is for. It has now failed on two consecutive changes before the number was updated — and the
second time it failed **in CI rather than locally**, because it measures the built output and
CI builds before it tests. Run `pnpm build` before `pnpm test:coverage` or the figure you
check is the one from last time.

**`@formancy/spec` is listed because it nearly doubled without anybody noticing.** One
module imported `formancy.schema.json` to read a single integer — the longest value an
option may carry — and the bundler inlined all 40.6 kB of it: the package went from 8.7 kB
brotli to **16.4**, then back to 9.6 once the constant was written down and the derivation
moved into a test, where reading the schema costs nothing. Found by review rather than by a
gate, which is why the figure is now tracked here with the others.

**The QR encoder is listed separately because it is not in the bundle.** Drawing a code
needs `uqr`, and the build leaves it external — so a consumer with no `qrcode` node pays
for it in install size and not in their application bundle, and one who has a code node
pays 6.6 kB brotli for a dependency with none of its own. The 0.4 kB the barrel grew is
the drawing component, not the encoder.

So the honest position is: **the budget is unverified, not met and not missed.** Writing a
`size-limit` threshold now would mean choosing a number that passes, which is a guard
written green — the one shape this repository refuses. It is listed as debt in
[§11](11-risks-and-debt.md) instead.

## 9.4 Quality attributes deliberately not pursued in v0.1

Stated because an unstated non-goal reads as an oversight:

- **Horizontal scalability.** The rate limiter's default store is per-process,
  so more than one replica needs a shared store that is not yet provided.
- **Multi-tenancy.** Absent entirely; it is on the commercial side of the open-core
  line ([0003](../decisions/0003-open-core-line.md)).
- **Localised validation messages.** The engine emits error *codes*; turning a
  code into a sentence is the application's job. The `i18n` section covers the
  form's own words, not the engine's.
- **Offline submission.** Drafts exist; a disconnected client does not.
- **Manual accessibility audit and a published VPAT.** Automated checking is a
  floor, and the documentation says so rather than rounding it up to a claim.
