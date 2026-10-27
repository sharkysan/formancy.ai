# 0204 — The answers can be checked before they are sent, in words, from one list

- **Status:** accepted
- **Date:** 2026-10-28
- **Extends:** [0193](0193-a-submission-is-read-back-in-words.md), whose `answersInWords` the review
  reads, and the wizard's failed-send navigation, which checking reuses
- **Deciders:** Daniel Bacher
- **Verified by:**
  - **`packages/core/src/review.test.ts`.** `answersToReview` lists every answer in words in
    document order, with the page its question is on and the control a "Change" focuses, and leaves
    out a question nobody answered. Both cases failed against a stub.
  - **Both renderers' `review.test`**, five cases each. On the last step, "Check your answers" stands
    where sending would; pressing it moves focus to the heading and shows the answers in words — an
    option by its label — without sending, and the form is sent from there. With a problem on the
    page it shows the problem and no review. "Change Country" lands on that question's control, on
    its own page. A form with no pages reviews the same way. Without `review`, nothing changes. Four
    of the five failed before the change; the fifth holds today's behaviour.
  - **Both `words.test`s** find the button, the heading, "Change" and the empty review in German;
    **`apps/docs/src/themes.test.ts`**, that every theme styles each part.

## Context

A long form, and a paged one most of all, ends on its last question with a button that sends
everything. What the person answered three pages ago is out of sight, and a default left alone
(0197) is not something they chose. The pattern public-sector forms settled on is a step between
the last question and sending: every answer, as the person would say it, each with a way back.

Two pieces existed. `answersInWords` (0193) says a submission's answers as a person reads them —
an option by its label, a date as the reader writes one — for an admin reading one back. And the
wizard already takes a failed send to the page of the first problem. Nothing joined them for the
person filling the form in.

## Decision

**An opt-in step, `review`**, on React's `FormancyForm` and Angular's `formancy-form`:

- **Where the form would send, it offers "Check your answers."** Pressing it validates the whole
  form as a send would — the same `submit()`, so every field is touched and the errors shown — and
  with a problem goes to the page of the first one, as a failed send does. Nothing is sent.
- **Without a problem it shows the answers**: a heading that takes focus, so a screen reader says
  where the person now is, and each answer in words under its question in a `<dl>`, with a
  **Change** whose accessible name is "Change" and the question. Change leaves the review for the
  question's page and focuses its control once that is drawn. The form is sent from the review.
- **One list, `answersToReview`**, in `@formancy/core/words`: what `answersInWords` says of the
  form as it stands, with each answer's page and control id. Both renderers draw it, so they cannot
  disagree about what is listed or where a Change goes. A matrix answers one line per row and its
  Change goes to the matrix, which `answersInWords` now says with each line's `field`.
- **A question nobody answered has no line.** The review is of what will be sent, as a submission
  read back is.

Off unless asked for: a host's form that ends in Submit today ends there tomorrow.

## Consequences

**A default left alone is seen before it is sent**, as an answer like any other — though nothing
records that the person looked (SAFETY-ANALYSIS A10).

**The words entry shares `path.ts` with the engine now**, since a Change parses an answer's path;
the bundle figures in §9.3 say what that costs.

**An unanswered optional question is invisible in the review.** A person who skipped one by mistake
is not reminded of it there. Listing every question would be a different review — of the form, not
of what is sent — and is not this.

## Alternatives considered

**A component the host places**, rather than a step in the form. More freedom, and every host
writing the navigation back to a question themselves — the part that is easy to get wrong for a
field on another page.

**Always on.** The pattern is good for long forms and noise on a two-question one; the host knows
which it has.

**Review every question, unanswered ones as "Not answered".** A fuller checklist, and a second
reading of the form beside the one `answersInWords` already gives every submission — two lists that
could disagree about what was answered.
