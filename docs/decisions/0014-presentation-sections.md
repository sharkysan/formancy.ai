# 0014 — Keep words and arrangement in optional sections

- **Status:** accepted
- **Date:** 2026-09-20
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/spec/src/i18n.test.ts` — "rejects a reference the
  default locale cannot resolve", "rejects a reference when there is no i18n
  section at all", "rejects a default locale with no catalog", "a non-default
  locale may be partial — translation is always in progress", and "falls back to
  the default locale rather than showing an id to a user";
  `packages/conformance/fixtures/translated-labels.json`, which runs through
  both renderer drivers and, because the suite resolves elements by accessible
  name only ([0034](0034-accessible-name-only.md)), fails every step for a
  renderer that leaks a message id. `label` is typed `Text` in
  `packages/spec/src/types.ts`, so a renderer that reads it as a string fails
  `pnpm typecheck`.

## Context

Spec v0 carried the label and the option labels as plain strings on the model,
openly rather than through a side channel, because a form without labels is
unusable. That was always temporary. Retrofitting
internationalisation into every string field later is brutal, so the key
structure was reserved from the start. This is the record of spending it.

## Decision

Two optional sections. `i18n` holds per-locale catalogues, and anywhere a person
reads something the document may carry either the words or a reference of the
form `{ "$t": "email.label" }`. `layouts` holds named arrangements that place
fields by data path, so one model can have a web layout and a print layout
collecting identical answers.

Two rules make `i18n` safe. Every reference must resolve in the **default**
locale, enforced when the schema is validated, because the failure mode is a
message id appearing in front of a customer. A missing translation in any other
locale falls back to the default rather than showing the id.

Resolution happens in the engine, not in each renderer: snapshots carry a
resolved `label`, and `engine.text()` handles option labels, repeater chrome and
page titles. That is the same reasoning as
[0021](0021-engine-owns-aria.md): two renderers must not be able to disagree
about what a field is called. The locale is fixed for the engine's lifetime,
because snapshots are identity-stable
([0020](0020-identity-stable-snapshots.md)) and a locale that moved underneath
them would leave every cached snapshot silently wrong. Switching language means
building a new engine.

## Consequences

**What it buys.** The last thing holding the spec freeze
([0009](0009-independent-spec-version.md)), and a model that can be arranged more
than one way without duplicating the data contract.

**What it costs.** Widening the label type from `string` to `Text` broke both
renderers at compile time. That is the type system working, and it also exposed
that the React conformance driver was casting the label to a string and would
have searched the page for `[object Object]`.

**What it forecloses.** Changing locale in place. Everything else is opt-in:
both sections are optional, so a monolingual form never has to think about
either.

## Alternatives considered

**Resolve text in each renderer.** Rejected: two implementations of fallback is
two chances to show a message id to a customer.

**Require an `i18n` section always.** Rejected: it taxes every simple form for a
feature it does not use.
