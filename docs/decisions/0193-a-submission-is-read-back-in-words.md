# 0193 — A submission is read back in words, through the version it was made on

- **Status:** accepted
- **Date:** 2026-10-27
- **Deciders:** Daniel Bacher
- **Verified by:**
  - **`packages/core/src/answers-in-words.test.ts`.** Every kind of answer read back under its
    question in document order — a choice by its option's label, ticks by their labels joined as
    English joins a list, a number and a date as the reader writes them, a tick box as Yes, a
    matrix row by row, files by name, a typed signature as the name, a group's and a row's fields
    under their container — the same in German, with the document's own German question; an
    unanswered question and a field that asks nothing have no line; an option since removed and
    a drawn signature are said rather than dropped.
  - **`apps/admin/src/workspace.test.tsx`**, *a submission to the current version is shown question
    by question*: the current version's submission is a list of questions and answers, and an
    older version's is its stored JSON.

## Context

The admin's submissions tab printed each submission as its JSON —
`{"country":"CH","topics":["a"]}` — which is what the server keeps and not what anybody
answered: the person chose "Switzerland", and ticked "Apples". An operator reading submissions
had to know the form's option values to understand them, and anything that sends a submission
to a person — a notification, a receipt, a printed record — would need the same reading done
again.

## Decision

**`answersInWords(schema, data, text, locale?)` in `@formancy/core/words`** returns each answer
under its question, in document order, read by the shape `ANSWER_KINDS` gives it
([0189](0189-every-answer-has-the-shape-its-type-says.md)). The words around the answers — Yes,
No, "A drawn signature", a row's position — are form words like any other, in English, German and
French, so a host changes them as it changes a button. The admin's submissions tab uses it for
every submission to the form's current version.

- **Read through the version the submission was made on**, which the caller supplies. A
  submission read against another version could put an answer under a question that is not
  there, or under one that now means something else.
- **What cannot be named is said as stored.** An option removed since, or a value no control
  wrote, is shown as its value rather than dropped: a reviewer must see what was submitted.
- **Nothing is a line that says nothing.** An unanswered question is left out, and so is a field
  that collects nothing.

## Consequences

**An older version's submissions stay as stored in the admin.** The API hands out the current
document and not an older one's, so the admin reads back only what it can read correctly. A
route for one version's document would let it read every submission, and is the follow-up.

**The words entry carries a function no renderer calls.** It sits beside the words it says
answers with; the package declares no side effects, so a renderer's bundle leaves it out.

**One reading for every later reader.** A notification or a receipt that says what was answered
calls this rather than reading the JSON a second way.

## Alternatives considered

**Format in the admin.** The admin is one reader of several, and the next one — a mail to the
person who submitted — would have to write the same reading again, a second copy of how a
matrix or a file is said that nothing compares with the first.

**Read every submission against the current version.** Simple, and wrong for exactly the
submissions where it matters most: those made before a question changed.
