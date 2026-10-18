# 0184 — A repeater is validated as a field is, and no row is added or removed past its bounds

- **Status:** accepted
- **Date:** 2026-10-18
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/core/src/repeater-bounds.test.ts` (17 cases): four rows on
  `maxItems: 3` refused with `maxItems` by the server's replay; `addRow` past it and
  `removeRow` below `minItems` each throwing, with `canAddRow` and `canRemoveRow` saying so
  first; a list written short over the repeater refused with `minItems`; a short submission
  topped up as the browser opens it, so a required answer in the seeded rows still refuses
  it; `required` on the repeater and a `required` rule aimed at it each refusing no rows;
  a `validate` rule aimed at the repeater refusing with its own code, and with `invalid` when
  it cannot be evaluated; a string or an object where the rows belong refused with `type`; a
  hidden repeater's rows kept by its own `clearOnHide`, and neither it nor they validated; a
  repeater cleared by its hiding and opened again with its minimum; a repeater on a skipped
  page and one inside a hidden group not validated, the group's own fields with them, and
  shown again when the group is; a disabled repeater's rows disabled with it and its bounds
  still checked; the repeater's snapshot, its error described by its group and listed for
  the error summary by its path; and a wizard page that does not go on past a repeater short
  of a row. Sixteen of the seventeen failed against the engine before this change, each for
  its reason — the seventeenth, the topped-up submission, holds 0023 in place — and sixteen
  mutations of the change were each caught by the case meant for it.
  `packages/react/src/repeater-bounds.test.tsx` and
  `packages/angular/src/repeater-bounds.test.ts`, near-copies with the same case names: no add
  button at `maxItems` and none to remove at `minItems`; a disabled repeater's buttons and rows
  disabled; the error drawn inside the repeater's fieldset and named by its `aria-describedby`;
  the error summary's link named *Guests: required* and taking focus into the repeater, and a
  failed submit doing so without a summary; and a hidden repeater not drawn. All seven failed
  in each renderer before the change, and six mutations in each were each caught.
  `packages/conformance/fixtures/repeater-bounds.json` holds both drivers to one reading of
  the repeater's own error, by its group's accessible name; it failed in both until the
  drivers read a repeater's path as well as its fields'.
  `packages/server-core/src/repeater-bounds.test.ts` and the *a repeater's rows, posted
  straight at the API* block of `packages/server/src/server.integration.test.ts`, against
  PostgreSQL: too many rows, none where required and a repeater's `validate` rule each
  answered `422` with the engine's code and nothing stored. Three of each four failed against
  the engine before the change, answered `201`; the fourth is the premise that a submission
  within every bound is stored. `apps/docs/src/list-totals.test.ts` holds the logic page's
  total to the cap it now gives, `maxItems`. `packages/core/src/scenarios.test.ts`, *while what
  the engine says at the list itself … may be expected*: an example expecting `maxItems` at a
  list of four on `maxItems: 3`, and the list shown, holds, one expecting no error is told the
  list has one, and a list set whole is still refused. With the engine changed and the runner
  not, it failed, as did 0182's *a repeater named whole* and *said the same wherever an example
  names it*, because a list's snapshot made the runner take a list as one answer; three
  mutations of the runner were each caught. `packages/builder-core/src/scenario-prompt.test.ts`,
  *says a repeater's own errors are expected at its path*, failed until the briefing said so.

## Context

The engine validated fields, and a repeater is not one. Its `maxItems`, `required` on it, and
a `required` or `validate` rule whose target was the repeater were all accepted at publish and
evaluated nowhere — not in the browser, and not in the server's replay of the same engine
([0030](0030-never-trust-client-state.md)). A submission with more rows than the document
allowed, or none where it said one was required, was stored; and a rule aimed at the repeater
failed open, where validation fails closed ([0022](0022-fail-open-fail-closed.md)). Found on
2026-10-18 by an agent building a demo form, and recorded before it was fixed: the logic page
told authors to cap a total's rows with a `validate` rule on the total, because the cap that
should have done it capped nothing.

Two neighbours were wrong in the same way. `minItems` — "how many rows the form opens with and
will not go below" — was held only at the opening: nothing stopped a removal past it, and the
Angular renderer put a row back in an effect where React let it go, the divergence
[0023](0023-model-properties-in-engine.md) recorded as its unfinished clean-up. And what a rule
hid, it hid only at its own wire: a hidden group's fields and a hidden repeater's rows were
still validated, a skipped page's repeater rows with them, and `clearOnHide` on a group or a
repeater was read from nothing, so their answers were cleared whatever it said.

## Decision

A repeater is validated as a field is, by the engine and nowhere else. Its rows as a whole
carry `type` unless they are a list of objects, `required` when there is none — required on a
repeater means **a row**, and what a row must hold is said by the fields in it — and
`minItems` and `maxItems`, the codes a `selectboxes` reports for the same questions. A
`required` rule aimed at it requires a row, and a `validate` rule aimed at it reads the form as
any field's does and fails closed. It has a snapshot, so a renderer draws its error on its
fieldset and the error summary names it by its label.

`addRow` past `maxItems` and `removeRow` below `minItems` throw, as a row index that is not a
row throws, and `canAddRow` and `canRemoveRow` say so first. Neither renderer offers a control
the engine would refuse: no add button at the maximum and no remove buttons at the minimum,
absent rather than disabled, as the move buttons are at the ends. A disabled repeater's
buttons are disabled.

What a rule hides or disables, it hides or disables whole: a group with the fields in it, a
repeater with its rows. A group's and a repeater's own `clearOnHide` is read. A repeater that a
rule hid and cleared opens again with its minimum when it is shown, as it opened the first time,
and the Angular renderer's effect that did that on its own is gone.

A short submission is still topped up rather than refused: the server's replay opens the form
as the browser does, and 0023 stands.

An example may expect what the engine says at a list itself — `errors` and `visible` at the
list's own path, as `"errors": { "items": ["maxItems"] }` — which
[0182](0182-a-list-is-filled-row-by-row.md) refused while there was nothing there to compare
with, and said it would have to let through on the day there was. A list is still filled row by
row: set whole, or expected as a value or as absent, it is refused as 0182 decided. The briefing
a model drafts examples from says so.

## Consequences

**What it buys.** A rule an author wrote about a repeater is enforced where every other rule
is, once, so the browser and the server agree by construction
([0006](0006-one-engine-build.md)). A person meets the cap as an add button that is not there,
not as an error after the fact, and the server refuses the post that never saw a button.

**What it costs.** Published forms change behaviour without being republished, because a form
version is immutable and the engine that reads it is not. A form with `maxItems` refuses a
submission with more rows; a required repeater refuses one with none; a `validate` rule on a
repeater, never run before, now runs — and a rule written wrong, which nothing ever showed to
be wrong, now refuses every submission rather than none. A draft saved with more rows than
the maximum resumes with no add button and is refused until it loses a row. A host calling
`addRow` or `removeRow` past a bound now gets a `RangeError` where it got a row.

The add button at the maximum is gone without a word: the person is not told why they cannot
add another, and a form whose author wants that said has to say it in the repeater's label or
a static field. The hidden-group half moves the other way: a hidden group's fields stop being
drawn and stop being validated, so a submission refused before — a required field in a group a
rule hid, which made the form unsubmittable — is accepted, and a group with `clearOnHide: false`
keeps its answers where it lost them.

The topped-up submission is a cost too. A script posting no rows to a `minItems: 2` repeater is
stored with two empty rows, exactly what an honest client leaving them empty sends; only a
required field in the row refuses it. And a group drawn by an arrangement still draws its
heading while a rule hides its fields, because a group has no snapshot to ask.

An example that expects a form to be invalid lists every error there is, so one about a
repeater outside its bounds that held before — the rows' errors listed and the list's not, since
there was none — fails until the list's own error is listed too.

The engine's bundle grew 0.3 kB, and its code 0.5 kB: comments the move out of `engine.ts`
let the bundler drop make up the rest ([§9.3](../architecture/09-quality-requirements.md)).

## Alternatives considered

**Bound the rows in the renderers.** Rejected: it is the fix that looks finished. The server
replays the engine, not a renderer, so a post that never drew a button would still be stored —
the failure this record exists for.

**`required` as at least one row with an answer in it.** Rejected: what "an answer" is differs
per type and per field, and the fields inside already say it with their own `required`. A row
whose fields are all optional is a row the author allowed to be empty.

**`required` seeding a row, as `minItems: 1` does.** Rejected: `required` is a question about
the answer and `minItems` one about the shape. An author who wants a row on open writes
`minItems`; one who writes `required` gets a form that opens with an add button and refuses
none.

**A disabled add button at the maximum.** Rejected for the reason the move buttons are absent
at the ends: a disabled button stays in some browsers' tab order and announces a control that
does nothing. Its one advantage, that it says a cap exists, is a sentence it never says.

**`addRow` past the maximum doing nothing.** Rejected: a silent clamp hides a caller's mistake,
which is why `moveRow` throws for a row that is not there.

**Refusing a short submission with `minItems` on the server.** Rejected by 0023 again: the
server and the browser would disagree about what an empty form is.

**Validating only the repeater's own wire, and leaving hiding as it was.** Rejected: a
repeater inside a hidden group would have been refused for rows nobody could see, and its rows
on a skipped page already were. One reading of "hidden" for every field is the one 0013 states.
