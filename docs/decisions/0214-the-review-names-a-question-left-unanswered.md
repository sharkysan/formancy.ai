# 0214 — The review names a question left unanswered, from the walk a submission read back takes

- **Status:** accepted
- **Date:** 2026-10-29
- **Deciders:** Daniel Bacher
- **Supersedes in part:** [0204](0204-answers-can-be-checked-before-they-are-sent.md), which left a
  question nobody answered out of the review
- **Verified by:**
  - **`packages/core/src/review.test.ts`.** *Name a question the person was asked and left
    unanswered, in its place*: Country and Nights are said *Not answered* where they stand among
    the answers, with their pages and controls. *Name no question a rule hides, a skipped page
    holds, a rule disables or computes, or a hidden field*: each of the four conditions removed in
    turn failed it. *Name an unanswered question in each row, and each unanswered row of a matrix.*
    All three failed before the change.
  - **Each renderer's `review.test`**, *names a question left unanswered, and takes the person back
    to answer it*: the line is drawn as the `review-unanswered` part and its Change lands on the
    question. Failed before the change in both.
  - **Each renderer's `words.test`**: *Nicht beantwortet* in a German form, and the empty review on a
    form that asks nothing.
  - **`apps/docs/src/themes.test.ts`**: every theme styles `review-unanswered`, which failed for
    each of the four before its rule.
  - **`packages/core/src/answers-in-words.test.ts`**, unchanged and passing: a submission read back
    still has no line for a question nobody answered.

## Context

0204 made the review a list of what will be sent, so a question nobody answered had no line. A
required question cannot be skipped, since checking refuses a form with one empty, but an optional
one can be: one passed over by mistake three pages back was missing at the one moment the form asks
the person to check, from a list with no gap in it, which reads as complete. The CHANGELOG and the
SOUP declaration listed it as something `0.8.0` and `0.9.0` knowingly do not have.

0204 considered listing every question and turned it down as a second reading of the form beside
`answersInWords`: two lists that could disagree about what was answered.

## Decision

**The review lists every question the form now asks**, in document order: an answered one in words,
as before, and the rest as *Not answered*, the word `answer.none`, each with its Change. A question
is asked when the engine's snapshot says it is shown, not disabled and not computed, and it is not a
`hidden` field: a rule hiding it, or a skipped page holding it, makes it not shown. A repeater asks
its questions once for each row it has, and a matrix asks each of its rows.

**One walk says both.** `readAnswers` walks the answers once and is told what is asked;
`answersInWords` takes it with nothing asked, so a submission read back has no line for a question
nobody answered, as before, and the review takes it with the engine's answer. Whether a question
is answered is decided in one place for both.

`ReviewedAnswer` gains `answered`. Both renderers draw an unanswered line's answer as the
`review-unanswered` part, which every theme sets in its muted colour and in italics.

## Consequences

A question skipped by mistake is in the list where the person checks, in its place, with a way back
to it.

**What it costs.** A long form with many optional questions left empty has a long review, one line
for each. A host's test that counted the review's lines, or expected the empty review on a form with
questions left unanswered, sees more: *Nothing has been answered yet* now shows only on a form that
asks nothing. `@formancy/core/words` is larger, 9.52 kB to 9.75 kB, measured on 2026-10-29 with
brotli. And the catalogue has one more word, which a host's own catalogue for another language
lacks until it adds it: a `FormWords` is partial, so such a form says *Not answered* in English.

**What it does not do.**

- **It records nothing.** As 0204 said, nothing stores that the person looked; and nothing about an
  unanswered line is sent.
- **A repeater with no rows has no line.** Its questions are asked per row, so a person who added no
  row is not reminded that they could have.
- **A field drawn with no control is still asked**, if it is shown: a file field in a deployment
  that takes no uploads is listed as not answered, and its Change focuses nothing, as the error
  summary's link to it does.

## Alternatives considered

- **An option, `review="all"`.** It leaves the choice to a host, but the gap is in the default: a
  review that hides a skipped question is the one that misleads, and the option would be API kept
  for a behaviour nobody should want.
- **A count at the top, *two questions not answered*.** It says that something was skipped, not
  where, and the person still has to find it.
- **A second walk in `review.ts`**, over the schema with the engine's snapshots. What 0204 turned
  down, for its reason.
