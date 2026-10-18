# 0181 — A computed value is the engine's: nothing else writes it, and its control is read-only

- **Status:** accepted
- **Date:** 2026-10-18
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/core/src/computed-targets.test.ts`. The snapshot says `readOnly`
  for a computed field and for a computed member of every row, a row added later included. A
  value set on a computed field does not take: not while its expression cannot be evaluated,
  not over the value the rule wrote last, and not in a row. A value handed in for one is
  dropped, at the top level and in every row, and on the server. All eight cases failed
  before the change. `packages/server-core/src/use-cases.test.ts`, *stores no computed value
  it did not compute, even when it cannot compute one*, failed with the client's `999999`
  stored as the total. `packages/react/src/computed-field.test.tsx` and
  `packages/angular/src/computed-field.test.ts` are near-copies with the same case names: a
  computed number is `readonly` and not `disabled`, the fields it reads are not read-only,
  each of the text, paragraph, number, date, time and date-and-time controls is read-only, and
  so is a computed member in every row. All eight failed in each binding with `readOnly`
  false. In Material, *a %s a computed rule writes is read-only, and not disabled* in
  `packages/angular/material/src/controls.test.ts` failed for all five of its boxes. The
  `calculated-value` conformance fixture is mounted with `999` handed in for its total, and
  its first step expects nothing shown there. Under the React driver against the old engine
  it failed with *step 0 (expectValue) failed: values differ*. It now passes under the
  React, Angular and Material drivers.

## Context

The spec described a `computed` rule as one the person filling the form in "cannot type
over", and the logic page said "nobody can type over it". The conformance fixture for a
calculated field said it was "read-only in the accessible tree", and its field carried
`readOnly: true`, a property nothing read.

None of that was true. Somebody building a demo form in the admin found the first part: a
computed *Total, CHF* was drawn as an ordinary number input that took typing, and making it
look like a result took a `disabled` rule with `cel: "true"`. The landing page's hero total
and the purchase-request template carry the same workaround. Following it through the engine
found the rest:

- **The renderers** drew a computed field with whatever control its type has, with nothing
  to say it was computed.
- **The engine** accepted `setValue` on it. The pass that every write triggers overwrote the
  value at once when the expression could be evaluated. When it could not, because an input
  it reads was still empty, the rule wrote nothing, which is
  [0054](0054-expressions-that-never-work.md)'s *the previous value stands*. In that case the
  typed value stood as though the rule had computed it.
- **The server's replay** ([0030](0030-never-trust-client-state.md)) behaved the same way. A
  total sent with `qty` left out was stored as the computed total, while `SAFETY-ANALYSIS.md`
  A3 said no residual was known for computed fields.

## Decision

**Only its rule writes a computed field.** The engine collects the fields `computed` rules
target, once, in their rules' own form (`items[].lineTotal` for every row). For those fields:

- `setValue` does nothing.
- The initial value has their values taken out before the first pass. That initial value is
  a resumed draft, a host's prefill, or on the server the request body.
- The field snapshot says `readOnly: true`.

Both renderers draw the field with the control's own `readonly`, never `disabled`, wherever
the control has one: text, paragraph, number, date, time and date-and-time. Material uses
`matInput`'s `readonly`. What the rule last wrote still stands while it cannot be evaluated,
as 0054 has it. The values that no longer stand are the ones the rule did not write.

## Consequences

**What it buys.** The spec's sentence is now true of the format and not only of one renderer.
It holds for a host's own control, for a control with no read-only state, for an initial value
and for a request body. The server stores only what it computed, which is what A3 claimed. The
decision is made once, on the snapshot, and both renderers read it. If each binding derived it
from the rules, the same decision would be implemented twice and the two could disagree
([0091](0091-a-second-builder-is-a-binding.md)).

**What it costs.**

- **A host can no longer put a value into a computed field.** That rules out a prefill and a
  "computed default" somebody could change. Such a value was overwritten whenever the
  expression could be evaluated, so it only ever worked while an input was empty, but it did
  work then.
- **A draft resumed with an input empty shows the computed field empty**, not the value the
  rule computed earlier. Likewise, the server stores no total where the browser showed the
  last one computed, because 0054's previous value exists in the browser and not in the
  replay. The stored record agrees with its own inputs; the screen at submission did not.
- **Every other control is drawn as before**: a tick box, a choice, a ranking, a matrix, a
  rating, a slider, a picker, rich text, a file, a signature, and a scanner's button. A change
  made in one does not take. React draws the control back. The Angular binding writes a bound
  value only when it changes, so it can go on showing the change: measured in jsdom, a ticked
  box over `false` and a select showing `b` over `a`. That was already true of every computed
  value whose expression could be evaluated, and the refusal makes it true of all of them. The
  logic page says to give such a field a `disabled` rule.
- **No shipped theme styles `[readonly]`**, so a read-only box looks like one that takes
  typing.
- **`@formancy/core` grows 0.4 kB brotli**, from 20.8 to 21.2 kB, measured on 2026-10-18.
  Of that, 0.2 kB is code; the rest is comments, which the bundler keeps
  (`docs/architecture/09-quality-requirements.md`).
- **`setValue` on a computed field is silent.** It does not throw, because a stray change event
  from a renderer would otherwise end the form.
- **A host writing a whole row or group with `setValue`** carries a computed member's value in
  with it. The next pass overwrites that value when it can evaluate the expression. The server
  never sees such a write, because it starts from the request body.

`engine.ts` has a ceiling of its own size and cannot grow, so two things left it to pay for
these lines. The decision itself went to `computed-targets.ts`, and the top-level walk that
`expressionProblems` shares went to `top-level-fields.ts`. The template form of a wire moved
to `path.ts`, beside the rest of the path model.

## Alternatives considered

**Change only the renderers.** Rejected: the claim belongs to the format, not to a renderer.
Every path the renderers do not own kept a value the rule did not write for as long as the
expression could not be evaluated, and the server stored it. Those paths are a host's own
control, the controls with no read-only state, an initial value and a request body.

**Draw it disabled, as the workaround did.** Rejected as the default. It takes the value out
of the tab order, is announced as unavailable, and greys out a number somebody is meant to
read. It stays available as a rule, and for the controls with no read-only state it is the
documented remedy.

**A `readOnly` property on the field, as the fixture had.** Rejected. It would state a second
time a fact the rules already state, and the two could disagree: a computed field nobody
marked, or a marked field nothing computes. It would also need a spec version, and version 4
is frozen.

**Empty the field when the expression cannot be evaluated**, instead of keeping what the rule
last wrote. Rejected: it changes 0054's behaviour for every form, and blanks a total on every
keystroke that leaves an input briefly empty.

**Make every other control read-only too**, with `aria-readonly` and a change handler that puts
the engine's value back. This is the right next step for the controls listed above. It is about
a dozen controls in each binding, each needing its own failing test, and it is recorded in
`docs/architecture/11-risks-and-debt.md` rather than done here.
