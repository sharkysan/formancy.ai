# 0212 — A signature's typed box carries what its field says, and is named after it

- **Status:** accepted
- **Date:** 2026-10-28
- **Supersedes in part:** [0186](0186-a-fields-control-id-names-its-group-or-its-control.md), which
  gave the box the field's control id alone and left its name as its own words
- **Verified by:**
  - **`packages/react/src/signature.test.tsx`**, *the box a name is typed into*, **and
    `packages/angular/src/new-types.test.ts`**, *its typed box*: the box is found by the name
    *Sign here: type your name* under the field labelled *Sign here*; and a required signature sent
    empty has a box with `aria-required` and `aria-invalid`, described by the field's error, which
    is drawn. Each case watched failing in both renderers before the change.
  - **`packages/react/src/words.test.tsx` and `packages/angular/src/words.test.ts`**: a German
    form names the box by the German word with the field's label in it.

## Context

A signature has two routes to one answer: a drawing surface, which is an image to assistive
technology because a keyboard cannot use it, and a box a name is typed into, which is the field's
control. 0186 gave the box the engine's control id, so the field's label points at it and the error
summary's link lands there, and gave it nothing else of the field's: no `aria-required`, no
`aria-invalid`, no `aria-describedby`. A screen reader taken there from the summary heard the box
and not the problem, and a required signature did not say so where the keyboard was.

0186 also left the box named by its own words, *Type your name*, through `aria-label`, which
outranks the label pointing at it — so the field's visible label, *Signature*, labelled a box whose
name did not contain it. WCAG 2.5.3, Label in Name, counts that as a failure (F96): a person who
says "Signature" to a voice control finds nothing. No axe rule reports it. 0186 left it because
renaming the box changes the name tests find it by, and said so.

Since 0210 the box carries `disabled` with its field, which 0186 had named as the reason not to
spread the field's props on it. The reason was gone.

## Decision

The box carries all of the field's control props — the id, the name, `aria-required`,
`aria-invalid`, `aria-describedby` and `disabled` — as every other control does. Its name is the
word `signature.typed` with the field's label in it, the label first: *Signature: type your name*,
*Unterschrift: Namen eingeben*, *Signature : tapez votre nom*.

## Consequences

A screen reader at the box hears the field's name, that it is required and what is wrong; a voice
control user saying the visible label reaches it.

**What it costs.** A host's test that found the box by *Type your name* exactly finds nothing, and
a host that reworded `signature.typed` keeps its own words, without the label, until it adds
`{label}`. [`MIGRATIONS.md`](../../MIGRATIONS.md) says both. And the name is longer, so it is read
in full on every visit to the box.

**What it does not do.** The drawing surface is still an image named by the field's label alone,
so `getByLabelText` with the field's label still finds two elements, as 0186 recorded.

## Alternatives considered

- **`aria-labelledby` pointing at the field's label and a hidden phrase**, leaving the word as it
  was. The same name, built from two elements, one of them hidden text the renderers ship no style
  to hide. A word with a placeholder is how every other control here puts a field's label into its
  name — the tag picker's list, a repeater's buttons.
- **No `aria-label`, so the field's label names the box.** The box would be called *Signature*, the
  same name as the drawing surface beside it, and nothing would say a name is typed there.
