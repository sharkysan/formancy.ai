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
| `@formancy/core` bundle | 18 kB brotli | gate configured |
| `@formancy/react` bundle | 4 kB brotli | gate configured |

The performance gate is written to fail on a regression greater than 15%,
which converts "fast on large conditional forms" from a claim into a test.

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
