# 0080 — A choice control dresses its own states

- **Status:** accepted
- **Date:** 2026-09-28
- **Deciders:** Daniel Bacher
- **Verified by:** `apps/docs/src/themes.test.ts`, *'answers the pointer on a checkbox and
  a radio, not only on a text field'* — observed failing on all four appearances, for both
  the hover and the press — and *'the pointer cannot un-choose a checkbox or a radio'*,
  observed failing on Blueprint and Dusk, which are the two whose shared hover declared a
  property their chosen state also declares.

## Context

Reported twice from the running page, the second time with the appearance named: *"the
radio button and checkbox is still not visible when clicking or hovering (dusk theme)"*.

Measured in a browser rather than read off the stylesheet, and the measurement found two
defects rather than one.

**Neither control had a state of its own.** Every theme dresses its controls through one
group — `:is(input, select, textarea, [data-formancy-part='richtext-surface'])` — and the
pointer rule in that group changes the fill. On a text field two hundred pixels wide that
is the right answer. On an 18px circle it moved the background from `rgb(17, 21, 31)` to
`rgb(21, 26, 38)`: a contrast ratio of about 1.03:1, across a shape too small to carry a
fill change in the first place.

**And the pointer repainted the chosen state.** A chosen radio in Dusk sits at the signal
violet, `rgb(124, 107, 245)`. Under the pointer it turned `rgb(21, 26, 38)` — the page's
own dark. Click a radio and it lights up; leave the pointer where it is and it goes out
again. That is what "not visible when clicking" looked like from the outside, and it is a
worse fault than the first, because the control was contradicting the value it holds.

The mechanism is `:is()` specificity, and the arithmetic is worth writing down because it
is not obvious:

| selector | specificity |
|---|---|
| `[theme] [part=field] :is(input, …, [data-formancy-part='richtext-surface']):hover:not(:disabled, :focus-visible)` | 0-5-0 |
| `[theme] [part=field] input:is([type='checkbox'], [type='radio']):checked` | 0-4-1 |

`:is()` takes the specificity of its most specific branch — an attribute selector, 0-1-0,
contributed by the richtext surface that shares the group. `:not()` does the same, and the
hover rule carries one, which is the step that puts it above `:checked`. The focus rule in
the same group carries no `:not()`, stays at 0-4-0, and loses to `:checked` — which is
exactly why focus was correct all along and only the pointer was wrong. A class of bug
that looks like a missing rule and is actually one rule too many.

## Decision

**The shared control rule is for text-like controls, by name.** Its `:not()` excludes
`[type='checkbox']` and `[type='radio']`, so nothing that dresses every control can reach
them.

```css
:is(input, select, textarea, [data-formancy-part='richtext-surface'])
  :hover:not(:disabled, :focus-visible, [type='checkbox'], [type='radio'])
```

**And each appearance states the two controls' hover and press itself, with feedback whose
size does not depend on the control's.** The edge takes the accent and a ring is drawn
outside it, closing onto the control on the press — except in Pop, where the chips and the
buttons already say "the shadow is the distance to the page", and the control lifts and
presses in that same language.

`outline` rather than a second `box-shadow`, because in Dusk and Blueprint the chosen
radio's dot **is** a box-shadow, and a shadow on hover would have replaced it — the same
defect in a different property.

## Consequences

**A new appearance has to say what its choice controls do under the pointer.** It cannot
inherit it from the group any more, and the guard fails until it does. That is the cost,
and it is the point: the group's answer was never right for these two.

**The guard compares property families, not values.** `background-color` and `background`
are one family, so a shared rule declaring either is caught; a shared rule painting a
chosen control with something `:checked` does not declare — an `opacity`, a `filter` —
would not be. The invariant checked is the one that broke, not every one that could.

**Pop's per-control rules are reached only by a standalone checkbox.** Its radio sets are
chips, with the label stretched over the chip so the chip is the target, which means the
input inside is never the hovered element. The rules are still right for the checkbox that
stands on its own, and they are what the guard reads.

**None of this is measured by a gate.** jsdom has no layout, no browser runs these
stylesheets in CI, and the contrast numbers above came from a browser driven by hand. The
guard reads the stylesheets and can say that a rule exists and that nothing overrides it;
it cannot say the result is visible. `SAFETY-ANALYSIS.md` D7 carries that residual.

## Alternatives considered

**Raise the specificity of the `:checked` rules** until they outrank the shared hover.
Rejected: it is an arms race decided by whoever last added a `:not()`, and it fixes the
symptom in four files while leaving the shared rule still claiming controls it should
never have dressed.

**`!important` on the chosen state.** Rejected for the same reason, with an extra one: a
consumer overriding a theme is a supported thing to do, and `!important` in a stylesheet
they are meant to build on takes that away.

**Drop the `:not(:disabled, :focus-visible)` from the shared hover** and restore the order
by lowering its specificity. Rejected because the `:not()` is load-bearing — without it a
disabled control answers the pointer and a focused one loses its ring — and because the
ordering would then depend on a subtlety nobody reading the file can see.

**Style the wrapper instead of the control**, as Pop does with its chips, in all four
appearances. Rejected as a bigger change than the report asks for: it is a different visual
design, not a fix, and three of the four appearances deliberately draw the control itself.
