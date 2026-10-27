# 0199 — An option can be chosen only on its own, and one function ticks it

- **Status:** accepted
- **Date:** 2026-10-27
- **Extends:** [0194](0194-spec-5-opens-with-a-fields-description.md), as the sixth construct of
  the version it opened, and the first of the choice extras it named
- **Deciders:** Daniel Bacher
- **Verified by:**
  - **`packages/spec/src/exclusive.test.ts`.** `exclusive` on an option of a list of ticks
    validates; on a radio group, a dropdown or a ranking it is refused as
    `option.exclusiveNotAList` at the option's path; a version 4 document carrying one is refused
    with `version.property`.
  - **`packages/core/src/exclusive.test.ts`.** A list holding an exclusive option with anything
    else — another option or a second exclusive one — is refused as `exclusive`, and one holding
    it alone is not; `ticked` keeps the options' order, clears every other tick when an exclusive
    option is ticked, and clears the exclusive ones when another is. The engine case and both
    clearing cases failed before the change.
  - **Both renderers' `exclusive.test`** — ticking "None" clears the list, ticking another clears
    "None", and a tag picker choosing "None" keeps only it — and Material's case in
    `controls.test.ts`, which failed with its control put back.
  - **Both builders' `property-panel.test`**: the option editor offers "Only on its own" on a list
    of ticks and nowhere else, and unticking it leaves no flag.

## Context

A list of ticks — "Which of these are you allergic to?" — needs a way to say *none of them*. An
empty list cannot: it is also what a person who skipped the question leaves, and `required` on the
field then refuses the honest answer. So forms add an option "None of these", and nothing stops a
person ticking it together with "Nuts" — an answer that contradicts itself, stored and exported as
both.

The gap survey behind version 5 listed it among a choice's extras, with "Other, please specify" and
a shuffled order.

## Decision

**`exclusive` on an option of a list of ticks**: that option is chosen alone or not at all.

- **The engine refuses a list holding it with anything else**, with `exclusive`, in the function
  every answer is checked with — so the server refuses a payload posted past the controls, as it
  does an option the list does not offer.
- **`ticked`, in core, is what every control's next list is**: ticking an exclusive option clears
  every other, and ticking any other clears the exclusive ones, in the options' own order. React's
  list and tag picker, Angular's two and Material's call it, so no control can store what the
  engine refuses and no two controls can disagree about what a tick does.
- **Only on a list of ticks.** In a radio group and a dropdown every option already is exclusive,
  and a ranking or a matrix uses every option; the flag there would validate and do nothing, so the
  document is refused.

Several options may be exclusive — "None of these" and "Prefer not to say" — and each excludes the
others too.

## Consequences

**A list can say "none" as an answer**, distinct from not answering, and a required field accepts
it.

**One more code the engine reports**, said in every language the renderers speak, and told to a
model drafting examples.

**"Other, please specify" leaves the list 0194 named.** It needs nothing new in a document: an
option, a text field and a `visible` rule on it already say it, and the engine already clears the
text when the option is not chosen. What is missing is the builder doing those three in one step,
which is a command, not a construct — the case 0194 said would leave the list rather than hold the
version open.

## Alternatives considered

**Leave it to a `validate` rule** — `!('none' in allergies && size(allergies) > 1)`. Every author
writes it, few do, and none of the controls would untick anything: the person would be told after
the fact that their answer contradicts itself.

**A field property naming the exclusive value** — `noneOption: "none"`. One per field, where a
form wanting both "None" and "Prefer not to say" needs two, and a property of the field describing
one of its options is the option's own business.

**Untick in each control and refuse nothing.** The answer would be right from every control and
wrong from every script, which is the drift the engine's one check exists to prevent.
