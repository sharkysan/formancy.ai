# 0235 — A date and time in a condition is the instant its author chose, written as every answer is

- **Status:** accepted; extended by [0236](0236-a-temporal-field-compared-with-text-not-in-its-shape-is-named-at-publish.md): a publish names such a rule in a warning
- **Date:** 2026-11-15
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/builder-core/src/condition-draft.test.ts`, *a date and time
  compared*, in which each case pins its own time zone. 10:30 typed in Zurich in October is
  written as `2026-10-08T08:30:00Z`, and in New York as `2026-10-08T14:30:00Z`. Through the
  engine, *is after* that moment holds for answers at 08:31 and 09:00 UTC and not for the moment
  itself, and *is* holds for the answer the renderer stores for the same entry and not for 10:30
  UTC. Watched failing before the change, three of its five cases: the value written as typed,
  `2026-10-08T10:30`; *is after* false for 09:00 UTC; *is* false for the matching answer. The
  other two hold the guards the conversion needs, and passed before the change because nothing
  was converted then. One says an empty box stays empty. The other says text shaped like a wall
  clock that names no moment, a thirteenth month, stays as typed. That one was watched failing
  with the guard removed, as `RangeError: Invalid time value`.

## Context

The builder's condition editor draws a `datetime-local` box for a date-and-time field. Such a
box hands back the author's own wall clock with no zone and no seconds, `2026-10-08T10:30`.
`conditionOf` narrows the typed text by the field it is compared with: to a number for a number
field, to a boolean for a checkbox. For a date-and-time field it kept the text as typed. So the
rule was written as `departs > "2026-10-08T10:30"`.

An answer to that field is an instant in UTC with seconds, `2026-10-08T08:30:00Z`
([0067](0067-a-temporal-answer-is-one-fixed-width-string.md)), and a rule compares the two as
text. That is correct only between strings of one shape, so such a rule was wrong in two ways at
once:

- **By the author's offset.** 10:30 typed in Zurich was compared as 10:30 UTC, two hours late,
  and 10:30 typed in New York four hours early. On a runner set to UTC this half cannot be seen.
- **By width.** No twenty-character answer equals a sixteen-character literal, so *is* never
  held for anybody, and *is not* always did. And a string sorts after its own prefix, so the
  answer at the very moment chosen counted as after it.

The renderers had solved the same problem for a respondent from the start: their date-and-time
control reads the box as local time at the moment somebody types, and stores the instant. The
editor never applied that conversion to what an author types.

## Decision

**A date and time typed into the condition editor is read as the author's wall clock, in their
own zone at the moment they choose it, and written as every answer is written: UTC, with
seconds, and `Z`.** It happens in `conditionOf` in builder-core, which both builders' panels
call, so the React and the Angular editor cannot write it differently.

Only the form `datetime-local` hands back, `YYYY-MM-DDTHH:MM` with optional seconds, is passed to
`new Date`, which reads exactly that form as local time by the language's own rule. Anything
else, an empty box included, stays as typed, as an empty number box does.

## Consequences

**A rule the editor writes now holds when the author meant it to, wherever the author sits.**
The literal and the answers have one shape, so comparing them as text orders them in time
again, *is* can hold, and the rules overview's verdicts, which compile the same comparison,
agree.

**What it costs:**

- **A rule written by an earlier builder keeps its expression.** The expression is what is
  stored, and published versions are immutable
  ([0025](0025-immutability-in-the-database.md)). The author's time zone was never recorded, so
  nothing can work out which instant such a literal meant, and nothing converts or reports one.
  A literal without seconds and without `Z`, compared with a date-and-time field, is such a rule.
  It is fixed by removing it and adding it again in the editor. The panels can only add and
  remove a rule, not reopen one. `MIGRATIONS.md` says so for every deployment that has published
  one.
- **The conversion reads the author's machine clock zone.** A builder opened in a browser set to
  another zone than the author's wall clock writes that zone's instant. That is the same trust
  the renderers place in a respondent's browser, and nothing here can check it either.
- **The rules overview shows the literal as stored.** It now names the moment as
  `2026-10-08T08:30:00Z` rather than as the 10:30 the author typed. It shows every answer as
  stored, so this is consistent with the rest of the overview, but it is not the author's own
  words. Showing an instant in the author's zone is a change to the overview's wording, left for
  a record of its own.
- **A literal written by hand is untouched.** `departs > "2026-10-08T10:30"` typed as CEL is
  still compared as text, as any string is. Nothing at publish yet tells an author that a
  date-and-time field is being compared with text that is not an instant.

## Alternatives considered

**Converting in each panel, when the box changes.** Rejected: the React and the Angular panel
would each hold a copy of one decision, and a rule's meaning would depend on which builder wrote
it. That is the divergence [0091](0091-a-second-builder-is-a-binding.md) puts decisions in
builder-core to prevent. The panels hand over what the box holds, and the core decides what it
means, as it already does for numbers and checkboxes.

**Comparing with `timestamp()` instead of as text.** Rejected for this change: it would make the
editor write every date-and-time comparison differently from every other comparison it writes,
for no gain once the literal has the answers' shape. CEL's `timestamp()` also compares only to
the millisecond in this build, which is a difference worth having only where it is needed.

**Repairing old rules, assuming UTC or the author's current zone.** Rejected: either assumption
is a guess about an instant nobody recorded. A rule repaired wrongly is worse than one the
documentation tells its owner to look at, because it looks fixed.

**A warning at publish for a date-and-time field compared with text that is not an instant.**
Not rejected, and not done here. It would find the old rules and the hand-written ones. It is a
publish check with a code of its own and a sentence in three languages, and it belongs beside
[0097](0097-a-publish-may-warn.md)'s warnings rather than inside a fix to what the editor
writes.
