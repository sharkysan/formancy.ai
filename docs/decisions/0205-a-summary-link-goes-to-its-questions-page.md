# 0205 — An error summary's link goes to its question's page

- **Status:** accepted
- **Date:** 2026-10-28
- **Extends:** [0186](0186-a-fields-control-id-names-its-group-or-its-control.md), which made every
  field draw an element with its control id so a summary link has something to focus
- **Deciders:** Daniel Bacher
- **Verified by:** each renderer's `summary-across-pages.test` — on a paged form whose failed send
  lists a problem on each of two pages, the link to the question on the page not shown lands focus
  on that question, and the link back lands on the first. Both failed before the change: the
  question was not on the page, and focus stayed on the link.

## Context

A failed send on a paged form shows the first page with a problem and lists every problem in the
error summary. Next checks each page it leaves, so a problem on an earlier page arrives through a
rule — a later answer making an earlier question required — and a problem on the current page
through the send itself. Either way the summary can list a question on a page that is not drawn.

Its link focused by element id. A question on a page not drawn has no element, so the link did
nothing: the person was told what was wrong and could not get there from the list that told them.
Measured on 0.7.0, in both renderers.

## Decision

**A summary link to a question on another page moves the wizard to that page**, with the
unvalidated jump the wizard keeps for error navigation, and **focuses the question once the page is
drawn** — React in an effect after the commit, Angular after the next render. A link on the page
shown focuses as before.

## Consequences

**A link can leave the page the person was on without checking it**, as a failed send already
does. Nothing is lost: answers stay where they were, and every page is checked again when the form
is sent.

## Alternatives considered

**List only the problems on the page shown.** Each page's problems would be reachable, and the
summary would stop saying how many problems the form has — which is what it is for.

**Validate the page being left first.** It would refuse the jump the person asked for because of a
problem the summary is already listing.
