# 0216 — A computed field with no read-only control is drawn as its answer in words

- **Status:** accepted
- **Date:** 2026-10-29
- **Deciders:** Daniel Bacher
- **Supersedes in part:** [0181](0181-a-computed-value-is-the-engines.md), which drew every
  control with no read-only state as before
- **Verified by:**
  - **`packages/react/src/control-id.test.tsx`, `packages/angular/src/control-id.test.ts` and
    `packages/angular/material/src/controls.test.ts`**, *written by a computed rule, has nothing
    in it a person can change, and a read-only box to read*. It covers every type the spec has,
    as its default control and as each widget it allows; a repeater is left out, for the reason
    below. Drawn with a computed rule, the field has no form control that is not `:disabled` or
    a `readonly` box, no editable region and nothing else a keyboard reaches. It does have a
    read-only box. It failed before the change on the same fourteen controls in React, in Angular
    and under Material: the rating, the slider, the tick box and the toggle, the select and the
    typeahead, the radio group, the list of ticks and the tag picker, the ranking, the matrix, the
    file, rich text and the signature. The text, paragraph, number, date, time and date-and-time
    boxes passed, and so did the scanner, whose button no case draws, since none supplies a
    scanner.
  - **Each renderer's `computed-field.test`**, *drawn by the checkbox, select and radio control
    says its answer in words, read-only*: *Yes*, *High* and *Low*, in a text box named by the
    field's label, read-only and not disabled. These failed in Angular before the change. In React
    they were written after the change, which the guard above had already been watched failing.
  - **`packages/core/src/computed-answer.test.ts`**: which controls have a read-only state, and
    what an answer says in words. Both failed before the functions existed.
  - **`packages/core/src/props.test.ts`**, *written by a computed rule, is one box, so a required
    one carries aria-required and names no hint*, which failed before the change.

## Context

0181 made a computed field the engine's. Only its rule writes it, and its snapshot says
`readOnly`. Both renderers draw the six controls a person types into with `readonly`: text,
paragraph, number, date, time and date-and-time.

Every other control has no read-only state, and 0181 drew it as before. That covered a tick box, a
choice, a list, a ranking, a matrix, a rating, a slider, a picker, rich text, a file and a
signature. A person could tick, choose, drag or sign one, and the engine refused the change. React
drew the control back. The Angular binding writes a bound value only when it changes, so it went on
showing the change. Measured in jsdom on 2026-10-18: a ticked box over the engine's `false`, and a
select showing `b` over `a`. The screen said one answer and the form held another (hazard A3).
The documented remedy was a `disabled` rule, which greys out a value meant to be read, and which an
author has to know to add.

A risk score's band, an eligibility tick and a derived category are computed. They are what such
forms compute most.

## Decision

**A field a computed rule writes, whose own control has no read-only state, is drawn as its answer
in words, in one read-only text box.** The answer reads *Yes*, a choice by its label, a list as the
language joins one, and a matrix row by row. The box is labelled by the field's label, in the tab
order, read-only and never disabled, as 0181 has it for the six.

- **Decided in core, once.** `hasReadOnlyControl` says which controls have a read-only state of
  their own: the six types, with no widget. A widget draws something else that takes an answer,
  such as a scanner's button, a rating's stars or a slider's thumb. `answerInWords`, in
  `@formancy/core/words`, gives the words a submission read back gives, so this box, the review
  and the admin say the same answer the same way.
- **Chosen where each renderer picks a field's component.** That is one place per renderer, so
  every control is covered, Material's included. A control a host registers for this field's
  path still wins. One registered for its type does not draw a computed field that has no
  read-only control.
- **One control to the engine.** A computed radio group, list of ticks, ranking or matrix is drawn
  as one box, not a fieldset, so `buildFieldProps` does not count it as a group. A required one
  carries `aria-required` and names no hint, as 0211 decided for the tag picker.

## Consequences

What the screen shows of a computed answer is what the form holds, in every control and both
renderers, and nothing in it can be changed. A `disabled` rule is no longer needed for it.

**What it costs.**

- **What a host sees changes.** A host's test that found a computed tick box by role `checkbox`
  now finds a `textbox` saying *Yes*, and one for a computed select finds *High*, not a
  `combobox`. A control a host registers by type for one of these types is not mounted for a
  computed field. [`MIGRATIONS.md`](../../MIGRATIONS.md) says both.
- **The look changes.** A computed choice no longer looks like the form's other choices: it is a
  box with words in it, as a computed number already was.
- **Bundle size.** `@formancy/core` measures 17.97 kB against its 18 kB budget, from 17.88 kB, on
  2026-10-29. The next growth there needs a decision. `@formancy/react` measures 15.74 kB, from
  15.52 kB, and the words entry 9.90 kB, from 9.82 kB.

**What it does not do.**

- **A computed repeater is drawn as a repeater.** A rule may compute a whole repeater's rows. The
  engine refuses every change to them: a row added or removed, a value typed into one. Its add and
  remove buttons and its rows' controls are still drawn as an ordinary repeater's. Recorded in
  arc42 §11.2.
- **A computed field whose options come from a source is said by its stored value**, since
  `answerInWords` has no source to name it by.
- **No shipped theme styles a read-only box apart**, as 0181 recorded for the six.

## Alternatives considered

- **`disabled` on each such control under a computed rule.** One attribute per control, and the
  thing 0181 refused: it takes a value meant to be read out of the tab order and greys it out.
- **`aria-readonly` on each control, and a handler that puts the engine's value back.** The
  control would keep its look. It is a job for each control in each binding: the same property
  bound by hand, the shape 0210 and 0211 showed is missed for the control nobody writes a case
  for. A native tick box or select has no read-only state for `aria-readonly` to describe either.
- **Refuse a computed rule on such a field.** It is valid in every frozen spec version, and a
  computed tick box or band is exactly what such forms need.
