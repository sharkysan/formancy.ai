# 0104 — Spec 4 opens with two widgets and a property, not a type

- **Status:** accepted
- **Date:** 2026-10-06
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/spec/src/rating-slider.test.ts` for the version line and
  where the widgets may go; `packages/core/src/engine-validators.test.ts` for the
  `step` check, including the floating-point tolerance; `packages/react/src/rating-slider.test.tsx`
  and the parity block in `packages/angular/src/new-types.test.ts` for the two
  controls; `apps/playground/src/starter.test.ts` for the demo using both; and
  `apps/docs/src/claims.test.ts` for `MIGRATIONS.md` naming each addition and saying
  that version 4 is **open**. `pnpm test:browser` renders them in Chromium in all four
  themes.

## Context

A comparison against SurveyJS listed six survey controls as gaps: rating/NPS, slider,
ranking, matrix/Likert, image choices and input masks. All six are genuinely absent —
the document schema defines eighteen field types and five widgets, and none of those
names appears in it.

**What the comparison treated as free is the expensive part.** Spec versions 1, 2 and 3
are frozen, and the version line is a reader contract: a version 3 reader given a
version 4 document must fail with a validation error rather than ignore what it does
not know ([0051](0051-spec-2-adds-types.md)). So "start with rating, slider and masks;
then ranking and matrices" is not an incremental path — it is two version bumps, and
`MIGRATIONS.md` already says to group reserved names into one.

## Decision

**Open version 4, and open it with the two constructs that change no answer.**

`widget: "rating"` and `widget: "slider"`, both on `number`, plus a `step` property.

**Widgets rather than types, and the test is the answer shape.** Every widget in this
format carries the same promise: it changes the control a reader sees and not what is
stored. A rating is a number between two bounds; a slider is a number between two
bounds. So both are a `number` field wearing different paint, and a version 3 reader
given one renders a number input, collects the same answer, and is wrong only about how
it looked.

**An NPS question needs no name of its own**: it is `rating` with `min: 0` and
`max: 10`. Giving it a construct would have been giving one spelling of one scale a
place in a frozen format.

**`ranking` and `matrix` are not here, for exactly the reason these two are.** A ranking
stores the respondent's chosen order and a matrix stores a row-to-column map, and
neither is an answer any existing type holds. Those are types, they are larger, and
putting them in the same change would have meant shipping four constructs at the quality
of two.

**`step` is a field property, not widget configuration**, and that is the load-bearing
choice. A slider is unusable without one — 0 to 1 in steps of 1 is a two-position
switch — but what the property says is *which values count as valid*, and that is the
field's business and the server's. In the widget it would have been presentation, and
presentation is never checked on the server: a value the client accepted and the server
refused is the drift this whole project exists to prevent. It is counted from `min` when
there is one and from zero when there is not, so `min: 2, step: 5` is a scale of 2, 7,
12 — which is what an author who wrote both of those meant.

**It is still a version**, even though nothing about the answer changes. The format is
closed, so a version 3 reader does not shrug at `widget: "rating"` — it refuses the
document. A version that rendered the default control instead would collect the same
answers and look entirely correct, which is the silent failure the version line exists
to prevent ([0065](0065-a-widget-is-authored-not-registered.md)).

**Version 4 is open and says so everywhere.** Every other version's section in
`MIGRATIONS.md` says FROZEN; this one says OPEN, and the regulatory set now states that
a deployment pinning version 4 is pinning a format that may still gain constructs. A
manufacturer reading that set to decide whether their stored submissions sit in a
settled format gets a different answer for 4 than for 1–3, and that difference is the
point.

## Consequences

**A rating is a radio group, not a row of buttons.** Eleven buttons are eleven tab stops
that a screen reader announces as unrelated controls, with no sense that they form a
scale or that one is chosen. A radio group is one tab stop whose arrow keys move along
the scale. The group is named with `aria-labelledby` rather than by the shell's
`label[for]`, because a `label[for]` names a form *control* and a `role="radiogroup"` is
not one — in React the group rendered with no accessible name at all until that was
found.

**A scale with no bounds falls back to a number input.** The format cannot require
`min` and `max`: they are optional on every number field, and making them conditional on
a widget would mean a document that stops validating when somebody changes
presentation. So a field without them gets the plain control rather than an invented
range of 1–5 or 0–100. A control that makes up its own scale is worse than one that is
plain.

**A slider tells the engine nothing until it is moved.** A range input with no value
sits at its midpoint, so the thumb's position is a claim about an answer that does not
exist. The value stays null — `required` still bites, and the submission carries no
number — while the read-out shows where the thumb is.

**The step check needs a tolerance, not a remainder.** `0.30000000000000004 % 0.1` is
`0.09999999999999998`, so a slider at 0.3 with a step of 0.1 — an ordinary
configuration — would have reported an invalid answer that the control itself produced,
on a value nobody typed. The comparison is against a millionth of a step.

**The read-out is a `<span>`, not an `<output>`.** `<output>` carries an implicit
`role="status"`, which makes it a live region: every step of a drag would be announced
on top of the value the range input announces itself. That is the double-announcement
bug the accessibility design warns about, and the playground's own "every control has an
accessible name" guard is what found it.

**Three files were split, and the budget was right each time.** `packages/spec/src/types.ts`
gave up the layout vocabulary to `layout.ts` — how a form is arranged is a different
reason to change from what a field collects, and only types cross back, so there is no
cycle. `validate.ts` gave up the version gate to `version-errors.ts`: "is this document
well formed" and "may a reader of the declared version understand it" are two questions.
`apps/playground/src/app.tsx` gave up its editor pane. None of those seams would have
been found by looking for them.

**The React barrel grew 1.1 kB, from 20.0 to 21.1 kB.** The fifth data point in a
pattern §9.3 now records: every control a type gains lands in the barrel, because the
barrel is what `import … from '@formancy/react'` gets. The answer when that stops being
affordable is the per-entry split the original 4 kB figure was written for, not a smaller
control.

**And the themes guard had been checking 44% of the contract.** `emittedParts()` read
only the top level of each renderer's `src`, and every control lives in `src/fields/` —
so the scan saw **36 of 82** parts, missing `label`, `error`, `field`, and every part of
the file field, the rich text editor, the signature, the tag picker and the typeahead.
The guard that holds this project's theming claim passed because it was looking in the
wrong place, which is the most expensive way for a guard to be green. Fixing it cost
almost nothing — all 46 were already styled by hand in all four themes — and the gap it
revealed was only the two new controls, which this change owed anyway.

## Alternatives considered

**A `rating` field type.** What the comparison asked for, and what everybody calls it.
Rejected on the rule that decides every widget here: the answer is a number between two
bounds, which `number` already stores. A type would have meant a second way to store the
same answer, and two ways to store one answer is the divergence this project is built to
prevent.

**An `nps` construct.** Rejected as one spelling of one scale. `min: 0, max: 10` is the
whole of it.

**`step` as widget configuration** (`widget: { name: 'slider', step: 0.5 }`). The shape
[0066](0066-a-widget-may-be-configured.md) allows, and wrong here: the server never sees
presentation, so a stepped scale would have been enforced on the client and not on the
submission.

**Shipping all six constructs at once.** Fewer version bumps, and the roadmap's own
advice. Rejected because `ranking` and `matrix` need an answer shape, an engine
semantic, two controls, four themes and a conformance story each; four constructs at
once would have been four at the quality of two. Version 4 is open, so they can land in
it without another bump — which is the reason to open a version rather than to freeze one
in a hurry.

**Leaving the spec at 3 and treating the controls as consumer components.** Possible —
the registry lets a consumer replace any control. Rejected because the document could
then not *say* it wanted a rating, so two deployments of the same form would differ, and
the document is meant to be the whole truth about the form.
