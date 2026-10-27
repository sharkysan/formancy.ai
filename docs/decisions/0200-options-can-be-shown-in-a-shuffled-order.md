# 0200 — Options can be shown in a shuffled order, chosen once by the engine, and the answer keeps the written one

- **Status:** accepted
- **Date:** 2026-10-27
- **Extends:** [0194](0194-spec-5-opens-with-a-fields-description.md), as the last construct of the
  version it opened; [0019](0019-injected-capabilities.md), whose `random()` it is the first
  construct to read outside an expression
- **Deciders:** Daniel Bacher
- **Verified by:**
  - **`packages/spec/src/shuffle.test.ts`.** `shuffle` validates on a radio group, a list of ticks
    and a ranking, and is refused on a dropdown and a matrix; a version 4 document carrying it, or
    an option's `keepPlace`, is refused with `version.property` at each.
  - **`packages/core/src/shuffle.test.ts`.** The snapshot's `optionOrder` is every option once,
    Fisher–Yates over the ones that move from the `random()` the engine is given, with the ones
    that keep their place at their index; it is the same array after an answer changes and the
    same in every row; a field shown as written has none; a shuffled form without a capabilities
    source is refused, naming `random()`; and `ticked` stores in the written order whatever order
    the list was shown in. The order, the refusal and the stored order failed before the change.
  - **Both renderers' `shuffle.test`** — a radio group and a list of ticks drawn in the engine's
    order with the anchored option last, and ticks stored in the written order — and Material's
    case in `controls.test.ts`, which failed with its control put back.
  - **Both builders' `property-panel.test`**: "Keeps its place when shuffled" is offered where the
    options can be shuffled, and unticking it leaves no flag.

## Context

A person reading a list of answers picks the first plausible one more often than its share — the
primacy effect every survey method warns about. The remedy is to show the options in a different
order to different people. The gap survey listed it with a choice's other extras.

Three things make it more than a flag. **Where the randomness comes from**: the engine reads no
ambient clock, so that a replay is reproducible (0019), and an order drawn from `Math.random()`
would be the one thing on the page nobody could reproduce. **What is stored**: a list of ticks
stores its answers in the options' order so that two people choosing the same answers store the
same array, and the obvious implementation — order what is drawn, store what is drawn — would make
every respondent's array differently ordered. **What does not move**: "None of these" in the
middle of a shuffled list is not what anybody means.

## Decision

**`shuffle` on a radio group, a list of ticks or a ranking**, and **`keepPlace` on an option**.

- **The engine chooses the order once**, when it is built, with Fisher–Yates over the options that
  move, from the `random()` it was given, and keeps it for its life — an order that moved while
  somebody read it would move the option under their pointer. It is on the snapshot as
  `optionOrder`, the same in every row of a repeater, and absent for options shown as written.
- **A shuffled form needs a capabilities source**, as a form with rules does; without one the
  engine refuses it, naming `random()`, rather than shuffle from nothing or silently not at all.
- **Each renderer applies it in the one place it reads options** — React's `useResolvedOptions`,
  Angular's base `options`, Material's — with `inOptionOrder` from core.
- **Nothing stored follows it.** `ticked` now orders by the options as written, not as drawn; a
  ranking stores the order the person chose, as before. The server's replay neither needs an order
  nor reads one.
- **Not on a dropdown or a matrix.** A dropdown's order is how a long list is searched by eye, and a
  matrix's columns are a scale whose order is its meaning.

## Consequences

**Version 5 holds every construct its batch named**, less "Other, please specify", which left it
(0199). It can freeze.

**Two renderers over one document show two orders** — the playground's two previews do — because
each engine is its own person filling the form in. A host that wants one order for a session holds
one engine, or gives both the same `random()`.

**A host rendering a shuffled form must now pass `capabilities`**, even with no rules.

**`ticked` lost its order argument**, which arrived with 0199 and is in no release.

## Alternatives considered

**Shuffle in each renderer.** Three implementations of one decision, each reaching for
`Math.random()`, and nothing to make them agree about which options stay put.

**Store the order shown.** It would let an analyst correct for position, and it is a change to what
a submission is — a second answer beside every shuffled one. Not this construct.

**Keep exclusive options in place implicitly.** Usually right, and a second way of saying what
`keepPlace` says: an author who ticked "None" exclusive and wanted it shuffled could not say so.
