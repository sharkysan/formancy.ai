# 8. Cross-cutting concepts

Concepts that appear in more than one building block, and that a reader needs
in order to follow any of them.

## 8.1 The path model

Everything in formancy — the store, the diff, the logic rules, the layouts, the
server's stripping, the export columns — addresses data by the same path
grammar. Getting it right once was the reason repeaters stayed in v0.1.

```
email                      a top-level field
address.city               a field inside a group
contacts[2].email          a field inside the third row of a repeater
contacts[].email           the same field in the repeater's TEMPLATE
```

The rule that matters: **a page contributes nothing**
([0012](../decisions/0012-pages-scope-nothing.md)). A field on page 2 is
addressed exactly as if pages did not exist, so moving a field between pages
never moves data. A group nests; a repeater indexes.

## 8.2 Snapshots and change propagation

`getFieldSnapshot(path)` returns a frozen object — value, type, resolved label,
required, visible, disabled, touched, errors, ids, props, and the raw
definition — whose **identity** changes only when one of those changes
([0020](../decisions/0020-identity-stable-snapshots.md)).

Consequences worth knowing before adding state to the engine:

- Anything a renderer reads must be part of the snapshot *and* part of the
  invalidation rules. State added to one without the other is silently stale.
- Nothing that can change outside the invalidation rules may be baked into a
  snapshot. This is precisely why the locale is fixed when the engine is
  constructed rather than being a parameter of every read.

## 8.3 Determinism

The engine never reads `Date.now()`, a timezone, a locale from the environment,
or a random source. All of them arrive in an injected capability object, frozen
per pass ([0019](../decisions/0019-injected-capabilities.md)). A schema with
logic rules **throws** if constructed without one, so this is not a convention
that a caller can forget.

It is what makes server replay a check rather than a second opinion, and it is
also why the engine's tests never need to mock a clock.

## 8.4 Validation, in three tiers

| Tier | Where | Example |
|---|---|---|
| **Structural** | ajv against the spec's JSON Schema, ahead-of-time compiled | a field with no `key` |
| **Semantic** | `validateSchema`, expressing what JSON Schema cannot | a duplicate key; a rename whose old key still exists; a page below the top level; a pattern that does not compile; a message reference that resolves nowhere |
| **Model** | the engine, against answers | `required`, `min`, `maxLength`, anchored `pattern`, the closed format list, and expression-driven rules |

Messages in the first two tiers are written for a form author, not for a
compiler. "There is no `en` catalogue, so the language everything falls back to
has no words in it" is the register.

## 8.5 Hidden fields

A specified behaviour, not an emergent one
([0013](../decisions/0013-hidden-field-semantics.md)):

- A hidden field is excluded from validation.
- `clearOnHide`, default `true`, decides whether its answer is pruned.
- The **server** applies the same semantics from its own evaluation, so a
  client cannot smuggle data into a hidden branch by sending it anyway.
- Invariant, held by property tests: hiding then unhiding restores the value if
  and only if `clearOnHide` is `false`.

## 8.6 Accessibility

Owned centrally, because accessibility implemented separately in two renderers
is accessibility implemented differently in two renderers
([0021](../decisions/0021-engine-owns-aria.md)).

`engine.ids(path)` mints deterministic ids from the form id and the path, so
server-rendered markup and hydrated markup agree and the entire `useId`
mismatch bug class does not exist. `engine.props(path)` returns plain
serialisable objects carrying every ARIA attribute, composed once.

Specified centrally and not left to renderers: `aria-invalid` only when
validated *and* invalid; `aria-required` reactive because requiredness can be
expression-driven; real `fieldset` and `legend` for groups; **exactly one**
polite live region per form, with error text as a `describedby` target and
**not** also a live region — the classic double-announcement bug; and an error
summary with `tabindex="-1"` that receives focus but deliberately does not get
`role="alert"`, because focusing it already announces it.

The verification side of this is
[0034](../decisions/0034-accessible-name-only.md): a conformance driver may
find elements only by role and accessible name, so unreachable markup fails the
suite.

## 8.7 Theming

Three concentric mechanisms, each usable without the next:

1. **Prop getters.** A consumer who wants none of formancy's markup spreads
   `engine.props(path)` onto their own elements and still gets correct wiring.
2. **A component registry**, resolving `(type, widget)` to a component with
   precedence per-path > per-widget > per-type > default. Layout nodes resolve
   through the *same* registry, so the grid system belongs to the consumer too.
3. **The unstyled kit** — semantic HTML, zero CSS files, and stable
   `data-formancy-part` and `data-state` hooks, so a Tailwind user writes
   `data-[state=invalid]:border-red-500`.

Themes are strictly downstream and are never a dependency. The two shipped
themes are deliberately *different design languages* rather than two palettes —
different radii, typefaces, spacing, and different devices for showing an
invalid field — because that is what falsifies the headless claim. If either
had required a component change, the claim would be false.

## 8.8 Internationalisation

Optional, and resolved in the engine
([0014](../decisions/0014-presentation-sections.md)). Anywhere a person reads
something, the document may carry a literal or `{ "$t": "some.id" }`. Every
reference must resolve in the default locale, enforced when the schema is
validated; a missing translation in another locale falls back to the default
rather than showing an id.

Snapshots carry the resolved label, and `engine.text()` handles option labels
and anything else. Neither renderer reads `def.label` directly, which is how
they are kept from disagreeing.

## 8.9 Error handling

**Fail open on metadata, fail closed on validation**
([0022](../decisions/0022-fail-open-fail-closed.md)).

Server verdicts arrive in the identical shape local errors use and render
through the same path, so a renderer has one error model rather than two, and
they are cleared per field on edit.

Error codes, not sentences, are what the engine produces. Text belongs to the
message catalogue.

## 8.10 Security

| Concern | Approach |
|---|---|
| Expression sandbox | Non-Turing-complete by construction, plus structural limits, wall-clock budgets and a per-slot function allow-list ([0016](../decisions/0016-cel.md), [0017](../decisions/0017-expression-facade.md)) |
| Content-Security-Policy | No `eval` and no dynamic function construction anywhere, so a strict CSP needs no configuration ([0040](../decisions/0040-no-eval.md)) |
| Trusting the client | Nothing computed by the client is trusted; everything is recomputed and overwritten ([0030](../decisions/0030-never-trust-client-state.md)) |
| Account enumeration | A decoy hash, so both paths do the same work ([0031](../decisions/0031-enumeration-resistant-login.md)) |
| Export injection | Type-aware formula neutralisation ([0032](../decisions/0032-csv-formula-neutralisation.md)) |
| SSRF on webhooks | Resolve DNS in-process, refuse if ANY returned address is private, connect to the checked address through a pinned agent with Host and SNI preserved; redirects not followed ([0048](../decisions/0048-webhook-delivery.md)) |
| ReDoS from a form author | Anchored patterns, compiled at save time; `recheck` linting at publish is designed and **not yet implemented** |
