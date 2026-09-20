# 0047 — Render layouts, with the DOM as the arrangement

- **Status:** accepted
- **Date:** 2026-09-20
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/react/src/layout.test.tsx` and
  `packages/angular/src/layout.test.ts` — the same assertions, written twice on
  purpose. Each checks the declared order in the DOM, that a row carries no
  `role`, that a labelled section is a `group` with an accessible name, that an
  unlabelled one adds no bare group, and that the row element carries no inline
  style, so nothing about the reflow depends on JavaScript having run.

## Context

The spec gained a `layouts` section when it froze
([0014](0014-presentation-sections.md)), and nothing rendered it. A form could
declare that two fields sit side by side and every renderer would ignore it.

Side-by-side is also the arrangement where accessibility most easily breaks,
because it is the first time visual position stops matching document order.

## Decision

`FormancyForm` takes a `layout` name. Given one, it renders that arrangement;
given an unknown one, it falls back to model order, because a mistyped name
should not produce an empty form.

**The DOM is the arrangement. CSS only decides how wide things are.** Every
consequence below follows from that single rule:

- **1.3.2 Meaningful Sequence** and **2.4.3 Focus Order.** Children are emitted
  in the order the layout declares, and the stylesheet places them by source
  order alone — no `order`, no explicit `grid-column`. When those come apart, a
  screen reader and a keyboard meet the form in one order and an eye meets it
  in another.
- **1.4.10 Reflow.** A row becomes a single column when there is no width for
  two, through `repeat(auto-fit, minmax(12rem, 1fr))`. A media query, not a
  measurement: a layout that reflows only once JavaScript has run does not
  reflow, and the test asserts the row element has no inline style to make that
  hard to regress.
- **1.3.1 Info and Relationships.** A row is presentation and gets no
  semantics — two fields being beside each other is not a relationship the
  author described, and announcing "group" around every pair is noise. A
  *labelled* section is visibly grouping fields, so it says so programmatically
  too: `role="group"` with `aria-labelledby`. An **unlabelled** section stays a
  plain box, because a group with no accessible name is announced as "group"
  and tells nobody anything.

A field the layout omits is not rendered. That is the point — a print layout
without the consent checkbox is doing its job.

## Consequences

**What it buys.** One model, several arrangements, with the accessibility
properties decided once in the renderer rather than by whoever writes the
layout.

**What it costs.** A layout can omit a **required** field, which produces a
form that cannot be submitted and shows no reason why. The spec anticipated
this — `unreferencedPaths` exists for a builder to warn with — but nothing
warns yet, and the renderer deliberately does not second-guess the omission by
rendering it anyway.

The engine also had to expose its schema, which it had not before. Renderers
need the parts of the document that are presentation rather than state: which
layouts exist, and which locale the catalogues default to. It is read-only, and
nothing about the form's *behaviour* should be recomputed from it rather than
asked of the engine.

Writing it twice is the cost of [0004](0004-headless-core.md), paid again. A
layout feature in one renderer and not the other is exactly the drift
[0033](0033-one-suite-n-drivers.md) exists to catch, so the Angular tests are a
deliberate transcription of the React ones rather than a different set.

## Alternatives considered

**CSS grid placement from the layout** — emitting `grid-column` per field and
letting the document order stay model order. Rejected: it is the direct route
to 1.3.2 and 2.4.3 failures, and it is what makes so many form builders produce
layouts that read correctly and tab wrongly.

**`fieldset`/`legend` for a layout section.** Rejected: the model already has
`group` for a real grouping of controls, and a layout section is a visual
device. Using fieldset for both would make the two indistinguishable to
assistive technology, which is the opposite of what 1.3.1 asks for.

**A container element per row with `role="presentation"`.** Unnecessary: a
`div` with no role is already presentational, and the explicit role adds noise
without changing anything.
