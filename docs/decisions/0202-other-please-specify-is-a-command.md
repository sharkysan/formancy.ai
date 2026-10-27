# 0202 — "Other, please specify" is a builder command, composed from what the format has

- **Status:** accepted
- **Date:** 2026-10-27
- **Extends:** [0199](0199-an-option-can-be-chosen-only-on-its-own.md), which took it out of
  spec 5's batch because a document could already say it
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/builder-core/src/other.test.ts` — the command adds an `other` option
  that keeps its place, a text field straight after the choice and a `visible` and a `required`
  rule on it, composed as the condition editor composes a comparison; the engine opens the result
  and asks for the text only while "Other" is chosen; a list of ticks is asked with `in`; a choice
  in a repeater's row gets the row's field and rules; a version 4 document gets no `keepPlace`; the
  key is one nobody uses; it is refused on a field that is not a choice or already offers `other`;
  and one undo takes it all back. Every case failed against a stub. Both builders'
  `property-panel.test`: one button on a choice, gone once the choice offers "other", and none on
  another kind of field.

## Context

"Other, please specify" is a choice with an escape hatch: an option "Other", and a text box asking
what, which only matters when "Other" is chosen. Form tools usually make it a property of the
choice, storing the typed text inside the choice's answer or beside it under a name of the tool's
choosing.

formancy can already say it without a new construct — and 0199 took it out of version 5 for that
reason: an option, a text field, a rule that shows the field while the option is chosen and one
that requires it. The engine clears the text when the field is hidden, so a person who chose
"Other", typed, and then chose something else submits no stale text. What it lacked was the four
pieces in one step, which is the builder's job.

## Decision

**A command in `builder-core`, `addOtherOption`, offered by both property panels** on a radio
group, a dropdown or a list of ticks that does not offer `other` yet. In one edit, and one undo:

- an option `other`, labelled in the author's language, keeping its place when the options are
  shuffled (0200) — where the document's version can hold that;
- a text field straight after the choice, keyed after it (`channelOther`, or the next key nobody
  uses), labelled "Please specify";
- a `visible` and a `required` rule on that field, written by `composeRule` from the comparison
  "the choice is `other`" — or "includes `other`" for a list of ticks — so they read the choice at
  the path the engine does, a repeater's row included, and the logic panel reopens them as
  conditions.

## Consequences

**The answer is two answers**: the choice holds `other`, and the text field holds what was typed,
under its own key. Every consumer of a submission reads them as it reads any two fields; nothing
format-specific joins them.

**Everything it writes is ordinary.** An author can rename the field, reword the label, make the
text optional by removing the rule, or move the field elsewhere; nothing breaks, because nothing
remembers that the command wrote them.

**Removing the option does not remove the field.** The rules then read a value no option offers, and
the field is never shown. The author removes it as any field.

## Alternatives considered

**A property on the choice** — `other: true` — drawing the box inline beside the option and storing
the text in the answer. A version event, a new answer shape for three field types, and every
consumer of a submission learning it, for something two existing fields already store.

**A property naming the companion field.** Less change to the answer, and still a construct that
says nothing the rules do not.
