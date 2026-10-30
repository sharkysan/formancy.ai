# 0206 — A form's responses are summarised question by question, for the version they answered

- **Status:** accepted; counting in the browser, superseded in part by
  [0223](0223-responses-are-summarised-on-the-server.md)
- **Date:** 2026-10-28
- **Extends:** [0193](0193-a-submission-is-read-back-in-words.md), which reads one submission in
  words through the version it was made on; this reads them together, under the same constraint
- **Deciders:** Daniel Bacher
- **Verified by:**
  - **`packages/core/src/summary.test.ts`.** `summariseAnswers` counts a choice's options by label
    in the options' order, and a value no option names as itself after them; every tick of a list,
    an empty list as unanswered; a tick box as yes and no; a number's range and mean; how many
    answered a text; nothing for a field that asks nothing; a repeater's question over every row;
    each row of a matrix as its own question; and every question with none answered when there are
    no submissions. Every case failed against a stub; the repeater and empty cases again with their
    paths removed.
  - **`apps/admin/src/workspace.test.tsx`**, *the current version's responses are summarised
    question by question*: the summary counts the current version's response and says one to an
    earlier version is not counted. It failed before the change.

## Context

The admin listed a form's submissions one per row, each read back in words since 0193. The first
question anybody reading a form's responses asks is what they say together — how many chose each
option — and the answer was a CSV download and a spreadsheet.

The constraint 0193 found applies again: a submission is answered against the version it was made
on, and an older version's questions may differ. The admin has the current version's document and no
other.

## Decision

**`summariseAnswers`, in an entry of its own, `@formancy/core/summary`**, reads a set of submissions against one version's
document and says, per question in document order: how many answered; for a choice, a list of ticks,
a tick box or a matrix row, how many chose each option, by its label in the document's language; for
a number, its range and mean; for anything else — text, dates, files — only how many there are to
read. Emptiness is `required`'s, a value no option names any more is counted as itself so the counts
never fall short of what was answered, and a repeater's question is counted over every row.

**The admin draws it above the submissions** for the current version, and says how many responses to
earlier versions it leaves out, so a total is never mistaken for every response.

## Consequences

**Responses to an older version are not summarised.** The admin cannot read that version's document,
so it would be counting answers against questions that may have changed. When the server hands out a
version's document, the summary can be given one per version.

**It is no form's to carry.** In `/words`, which every renderer loads, it measured 0.8 kB more on
every form for a feature only the admin draws; an entry of its own costs a form nothing, and takes
its words as an argument so it shares no code with `/words`.

**A share is of those who answered**, so a list of ticks can add up to more than everyone.

**It is computed in the browser, from every submission the admin fetched.** A form with a very large
number of responses would want the server to count; nothing here does that yet.

## Alternatives considered

**Count on the server**, in SQL. Faster for a large form, and a second reading of answers beside the
one the engine and `answersInWords` share — the counting rules would be written twice.

**Charts.** A table with a bar is readable by a screen reader as a table and by everyone else as a
chart; a canvas chart is only the second.
