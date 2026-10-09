# 0141 — The Angular page compares formancy with no other product

- **Status:** accepted
- **Date:** 2026-10-09
- **Reverses:** the comparison half of [0136](0136-the-angular-page-runs-the-starter.md); the
  rest of that record — the starter running in the page, the derived versions and the checked
  snippets — stands
- **Deciders:** Daniel Bacher
- **Verified by:** `apps/site/src/angular-builder-page.test.tsx` — the page's regions are the demo,
  the install, saving and the tested versions; the case that held the comparison to its date and
  its sources is gone with it.

## Context

[0136](0136-the-angular-page-runs-the-starter.md) put a part-by-part comparison with SurveyJS on
`/angular-form-builder/` — renderer, visual builder, backend — dated and linked to SurveyJS's own
pages, because a statement about another vendor's licence is true on a day and nothing in this
repository can keep it true.

## Decision

**The page makes its case about formancy alone.** The comparison is removed, at the maintainer's
decision; the page shows the starter running, how to install it, how a form is saved and opened,
and the versions CI runs.

## Consequences

**A reader comparing products does that work themselves.** The page no longer answers the question
somebody arriving from a search for an Angular form builder may bring with them.

**One less claim to keep true.** The comparison was the one statement on the site that depended on
another party's pages and was held only by its date and by a person re-reading them.

## Alternatives considered

**Keep it, dated.** What 0136 did; reversed here.

**Move it to the documentation.** The same statement in a different place, with the same upkeep.
