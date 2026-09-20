# 10. Verification

What is checked, how, and what each check actually proves. The organising
principle is **one conformance suite, N drivers**
([0033](../decisions/0033-one-suite-n-drivers.md)): correctness is specified
once, as data, and executed against every implementation.

## 10.1 The fixture

```jsonc
{
  "name": "a required field blocks submit until it has a value",
  "description": "why this behaviour is the correct one",
  "schema": { /* a complete form document */ },
  "steps": [
    { "expectNoErrors": true },
    { "submit": true },
    { "expectSubmit": { "status": "rejected" } },
    { "expectErrors": { "email": ["required"] } },
    { "set": { "email": "ada@example.com" } },
    { "submit": true },
    { "expectSubmit": { "status": "accepted" } }
  ]
}
```

One file feeds five runners: the engine in Node, the engine in a browser, the
React driver, the Angular driver, and the server's revalidation endpoint.
A behaviour is written once and verified in five places.

The fixture format has its own validator, which refuses a case that could not
run honestly — including a field with no resolvable accessible name, since a
driver could never find it. Cases are embedded by a generator and the case list
is **pinned in a test**, so a case that silently stopped being embedded is
caught rather than leaving every renderer passing a suite that no longer tests
it.

## 10.2 The checks

| Check | Command | What it proves |
|---|---|---|
| Engine fixtures, Node and browser, deep-diffed | `pnpm test` | No client/server rule drift — the flagship claim |
| `fast-check` invariants | `pnpm test` | Hide/unhide restores iff `clearOnHide` is false; repeater add-then-remove is identity; evaluation is order-independent; cycles report deterministically |
| Renderer conformance, both drivers | `pnpm test` | Both renderers behave identically, with no framework-specific skips |
| axe-core after every mount and DOM-mutating change | in the same run | Zero automated accessibility violations |
| Server integration on real PostgreSQL via Testcontainers | `pnpm test` | Versioning and submission defects only manifest against real SQL semantics |
| The official CEL corpus, counts pinned | `pnpm test` | The expression evaluator has not regressed, and its gaps are known rather than assumed |
| Performance benchmarks | `pnpm bench` | The budgets in [§9](09-quality-requirements.md) |
| `publint` + `attw` + `size-limit` | `pnpm check:pkg` | The commonest cause of "it doesn't work in my app" for a multi-framework library |
| Typecheck with no `@types/node` in the isomorphic packages | `pnpm typecheck` | The layer boundary holds |

At the commit these documents describe: **808 automated tests** across eight
packages, plus 21 integration tests against PostgreSQL. Per package — spec 112,
expressions 189, core 222, conformance 115, react 52, builder-core 51, angular
34, server-core 33.

## 10.3 The driver interface is the accessibility contract

A driver may resolve elements **only** by role and accessible name —
`getByRole`, `getByLabelText`, `getByRole('group', { name })`. Never a test id,
never a CSS selector ([0034](../decisions/0034-accessible-name-only.md)).

A renderer whose markup is not queryable this way fails conformance.
Accessibility stops being a parallel workstream and becomes a property of
passing the tests.

The rule earns its keep rather than merely sounding principled. The first
fixture containing a radio group immediately proved that the React driver could
never have answered one: its radio branch sat below a control lookup that
throws first, because a group's accessible name is on the `fieldset` and not on
any control. Angular had it right; React was corrected.

## 10.4 Adversarial review

Packages whose failure would be expensive were reviewed with a brief to find
the defect rather than to approve the change. Three critical findings, none of
which the existing tests had caught:

| Package | Finding |
|---|---|
| `spec` | `diffSchemas` was blind to changes inside nested containers, so a breaking change could be reported as compatible — and draft migration trusts that answer |
| `conformance` | An assertion failing was confused with the driver crashing, so some failures presented as passes |
| `expressions` | An unmetered `split()` let a small expression allocate without bound |

Listed because a review process that has never found anything is not evidence
of quality.

## 10.5 What is planned and not yet in place

- **Integration by install** through a local Verdaccio registry, including a
  Next.js App Router case and an Angular SSR case. Hydration is where form
  libraries actually break in the wild, and in-repo tests structurally cannot
  see it.
- **An SSRF DNS-rebinding fixture suite** and a **ReDoS corpus**, for the two
  vectors most likely to be missed.
- **Visual regression**, narrowly: pixel tests only for the reference theme,
  the builder and the admin app, on pinned Linux and Chromium in a container.
  Deliberately *not* for the headless renderers — they ship no styling, so a
  pixel snapshot would be testing demo CSS. The meaningful invariant there is
  the accessibility-tree snapshot.
- **A manual accessibility tier**: keyboard-only journeys under
  `prefers-reduced-motion`, `forced-colors: active`, 200% zoom and a 320 px
  viewport; then NVDA with Firefox and VoiceOver with Safari each minor release.

## 10.6 The honest limits

Automated accessibility testing catches roughly **57%** of machine-detectable
issues by Deque's own published figure, and only about **30%** of WCAG 2.2
criteria are machine-testable at all. Zero axe violations is a floor, not a
conformance claim.

The expression evaluator passes 586 of 704 in-scope CEL specification cases.
The 118 failures are enumerated rather than averaged away, because a percentage
would let a reader assume their expressions are in the passing set.
