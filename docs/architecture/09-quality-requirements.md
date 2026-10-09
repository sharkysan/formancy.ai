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
| `@formancy/core` bundle | 18 kB brotli | **20.1 kB** — over, measured 2026-10-09 |
| `@formancy/spec` bundle | — | 25.0 kB for the whole barrel — the index and the chunk it shares with `/validate`, measured 2026-10-09 |
| `@formancy/react` bundle | 4 kB brotli | **23.9 kB** for the whole barrel, measured 2026-10-09 |
| `uqr`, the QR encoder | — | 6.6 kB brotli, **external** rather than bundled, measured 2026-09-27 |

The performance gate is written to fail on a regression greater than 15%,
which converts "fast on large conditional forms" from a claim into a test.

**There is no bundle gate, and this column said "gate configured".** Nothing in the
repository runs `size-limit` — [0038](../decisions/0038-esm-only.md) says so plainly in
its *Verified by* line, and three other documents said the opposite, including the
regulatory evidence table. The figures above are `brotliCompressSync` over each built
`dist/index.mjs` and every chunk it imports, each compressed on its own as it is served,
dated because they are re-measured rather than incremented.

**The spec row was 5.2 kB short, for the reason the next paragraph warns about.**
`@formancy/spec` has two entries, the barrel and `/validate`, and `tsdown` puts what both
import in a shared chunk. The guard measured `index.mjs` alone and so did the figure: 14.0 kB
"for the whole barrel" when the barrel loaded 19.3. Found 2026-10-09, when the validator's
English sentences moved into that chunk
([0122](../decisions/0122-a-validator-error-has-a-code.md)) and the figure did not move. The
guard now follows the barrel's imports, so a build that changes shape cannot shrink a row.

**The core bundle is over its budget, and that is the honest word for it.** 17.8 kB
became 18.7 against a stated 18 when `runScenarios` landed in it — the runner that
checks a form against written-down examples
([0110](../decisions/0110-a-form-is-checked-against-examples.md)). A browser rendering
a form never runs a scenario, so the obvious answer was a second entry point. It was
tried and reverted: `tsdown` code-splits a two-entry build, after which
`dist/index.mjs` is a file of re-exports measuring 2.8 kB and this row would have
reported a 15 kB improvement that is pure accounting. **A measurement that improves
because the build changed shape is worse than a number over budget.**

So the figure is the truth and the budget is breached. What makes it tolerable rather
than urgent is that the package declares `sideEffects: false`, so a consumer that never
imports `runScenarios` does not ship it — this row is the package, not what a renderer
pulls. What would actually fix it is measuring an entry point's dependency closure
rather than one file, which is a change to the guard rather than to the code, and is
not being made in the same change that broke the number.

**It went further over with the upload queue, and this time a renderer pays it.** 18.7 became
20.1 when each file became its own upload, decided in the core so both renderers read one
queue rather than keeping two ([0130](../decisions/0130-each-file-is-its-own-upload.md)), and
the React barrel went from 21.6 to 22.8 with the control that draws it. Unlike `runScenarios`,
the file field is in each renderer's default controls, so a form with no file field ships the
queue too. That is the cost of the decision living in one place; the alternative was the
measured row defect, made identically in both renderers.

**The spec figure moved 4.3 kB in one change, and the reason is worth the line.**
`diffSchemas` stopped comparing only a field's identity, its type and its `required`
flag: it now also reports options, constraints, rules, catalogues, layouts and anything
it has no comparator for
([0108](../decisions/0108-the-diff-reports-everything-that-changed.md)). That is the
function four readers trust to say what changed between two published versions, and it
used to answer `[]` for two materially different documents.

This row is the **barrel**, which is the honest number to quote and not the one a
renderer ships: the package declares `sideEffects: false`, so a bundler drops the diff
from a consumer that never imports it. Note what that sentence does not say — there is
no `./diff` entry point. `exports` has `.` and `./validate`, so a consumer wanting only
the diff takes the barrel and relies on tree-shaking rather than on an entry, which is
weaker than the per-entry design [0038](../decisions/0038-esm-only.md) describes. Worth
a second entry if anybody measures it mattering; written down here rather than assumed
either way.

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

**And again with spec 4: 20.0 kB to 21.1 kB** for the `rating` and `slider` controls. 1.1 kB
for two controls is the ordinary price of this list growing, and worth recording because the
pattern is now five data points long: every control a type gains lands in the barrel, because
the barrel is what a consumer importing `@formancy/react` gets. The answer when this stops
being affordable is the per-entry split the 4 kB figure was written for — not a smaller
control.

**21.3 kB with the input mask**, measured 2026-10-09: 0.2 kB for the binding alone. Where a
typed character lands is `editMasked` in `@formancy/spec`, which this package imports
rather than bundles, so the arithmetic is counted in the spec row and not twice
([0125](../decisions/0125-a-mask-stores-what-was-typed.md)).

**21.6 kB with pictures on options**, measured the same day: 0.3 kB for drawing a picture in
two controls and asking the format's rule before loading it
([0126](../decisions/0126-an-option-may-carry-a-picture.md)).

**22.8 kB with each file its own upload**, measured the same day: 1.2 kB for drawing the
queue — a row per file with its bar, cancel, retry and order, and a thumbnail decoded onto a
canvas. The queue's decisions are `@formancy/core`'s and counted in that row
([0130](../decisions/0130-each-file-is-its-own-upload.md)).

**`@formancy/core` is now 17.8 kB against an 18 kB budget, and that is tight enough to say
out loud.** The last 0.5 kB is `unknown-paths.ts`, a publish-time check that reports a rule
reading a path the model does not define
([0097](../decisions/0097-a-publish-may-warn.md)). No browser runs it. It is in `core` because
`core` is the lowest layer that can see both the spec's model and the expression walker, and
because the server and the builder's authoring check both want it — but it is measured here,
in the browser engine's figure, which is the honest place for a cost a renderer pays for
something it does not use. The per-entry `exports` map means a consumer importing
`@formancy/core` for the engine alone does not ship it; the figure above is the whole barrel,
as the React note below explains. The next thing added to this package should either be
smaller than 0.2 kB or arrive with a decision about splitting the barrel.

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

**The barrel grew 0.5 kB when the controls became separate files**, and that is the cost
of splitting `form.tsx` — 2,154 lines holding every control — into one file per control.
Measured both ways: dropping the re-export hop from `form.tsx` changed nothing, so the half
kilobyte is module boundaries rather than indirection this could remove. It was found by
`apps/docs/src/bundles.test.ts` on the same commit that made it, which is the guard doing
exactly what it is for: a refactor that improves how the code reads is still allowed to cost
something, and the number says how much rather than the change being waved through.

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
