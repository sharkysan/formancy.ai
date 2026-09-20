# 0021 — The engine owns element ids and ARIA composition

- **Status:** accepted
- **Date:** 2026-09-19
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/core/src/ids.test.ts` — "two different fields can
  never share an id" and "returns undefined when nothing is present, so the
  attribute is omitted entirely"; `packages/core/src/props.test.ts` — "a
  pristine invalid field claims nothing: no aria-invalid, no describedby", "a
  touched valid field claims validity by omission, never aria-invalid=false"
  and "aria-required reflects the effective, expression-driven requiredness";
  `packages/react/src/props.test.tsx` asserts the same wiring on the rendered
  DOM, and `packages/react/src/error-summary.test.tsx` — "receives focus on
  failed submit INSTEAD of the first field, and is not role=alert". The single
  polite live region described below is *not* built: `aria-live` appears
  nowhere under `packages/`, so that clause is a decision and not yet a design
  output.

## Context

Accessibility implemented separately in each renderer is accessibility
implemented differently in each renderer. Two hazards make this concrete.
`aria-describedby` is a composition problem — it has to dedupe, hold a stable
order, and be omitted entirely rather than emitted empty. Element ids are a
determinism problem: they have to survive server rendering and hydration
unchanged, which framework id generators do not guarantee across two
frameworks.

## Decision

The engine mints ids deterministically from the form id and the field path, and
composes every ARIA attribute centrally. `getFieldSnapshot(path).props` carries
plain serialisable objects — control, label, hint, description, error — that a
renderer spreads onto an element. A consumer who wants none of formancy's
markup can use only those and still get correct wiring.

Because the ids are derived rather than generated, the whole `useId` hydration
mismatch class does not exist here.

## Consequences

**What it buys.** The attributes are settled once, in the core, and not per
renderer: `aria-invalid` only when the field has been validated and is invalid,
and never emitted as `false`; `aria-required` reactive, because requiredness
can be expression-driven; and error text referenced through `describedby` and
*not* also made a live region, which is the classic double-announcement bug.
The markup rules the props cannot express are fixed identically in both
renderers instead — a real `fieldset` and `legend` for radio groups and for
repeaters, and an error summary that takes focus through `tabindex="-1"` and
deliberately carries no `role="alert"`, because focusing it already announces
it. The intended end state adds exactly one polite live region per form; that
part is not written yet.

**What it costs.** A renderer that wants to deviate cannot, short of ignoring
`props` altogether. That is intended, and
[0034](0034-accessible-name-only.md) turns deviation into a failing test. Ids
also become a derived public surface: an id contains the field path, so a
declared rename ([0011](0011-declared-renames.md)) changes every id belonging
to that field, and anything outside the library that pinned one breaks.

## Alternatives considered

**Leave ARIA to each renderer.** Rejected: it is the divergence this record
exists to prevent, and the bugs it produces are invisible to anyone not using a
screen reader.

**Use the framework's id generator.** Rejected: React's `useId` and Angular's
equivalent produce different ids for the same field, and neither is stable
across the server and client boundary the engine already has to cross
([0006](0006-one-engine-build.md)).
