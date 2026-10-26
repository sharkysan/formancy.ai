# 0188 — The documentation names no other form product

- **Status:** accepted
- **Date:** 2026-10-26
- **Extends:** [0141](0141-the-angular-page-compares-with-no-other-product.md), from one page of
  the site to every document a reader takes as formancy describing itself
- **Deciders:** Daniel Bacher
- **Verified by:** `apps/docs/src/other-products.test.ts` — no live document (the READMEs,
  `docs/` outside the decision records, the documentation site's content) and no page of the
  landing site names form.io, FormEngine or SurveyJS. Watched failing against the roadmap and the
  architecture introduction as they were.

## Context

[0141](0141-the-angular-page-compares-with-no-other-product.md) took the comparison with another
product off the Angular page, because a statement about another vendor is true on a day and
nothing in this repository can keep it true. The same kind of statement stayed elsewhere: the
roadmap had a section *Measured against the competition* that named two products, said what
one was bought for and the other led with, what each charged for and what each called a
feature; the architecture introduction opened by calling one of them the category's incumbent;
and three code comments repeated the comparison as the reason for a test.

## Decision

**The documentation makes its case about formancy alone.** The roadmap's section is now *What
an adopter weighs*, and says which features a form platform is chosen for, which exist here and
which are deliberately not coming, without saying whose list they came from. The architecture
introduction names the architecture it reacts against, not a product.

The changelog and the decision records keep the names they were written with. They record what
was argued at the time; rewording them to agree with a later decision would falsify the record,
which is the rule [`claims.test.ts`](../../apps/docs/src/claims.test.ts) already follows.

## Consequences

**A reader loses the reference point.** "This is what form.io is bought for" told somebody who
knew that product exactly which gap a paragraph was about; "what a form platform is bought for"
asks them to bring that knowledge themselves.

**The reasoning is still there for anyone who wants it.** [0001](0001-purpose-built-spec.md)
through [0006](0006-one-engine-build.md) say what the project was a response to, by name. That
is a deliberate split rather than a leak: a record is dated and says it is history; a roadmap
says it is current.

**The guard knows names, not intent.** It matches a list of products the documents once named. A
new one written into a page passes until somebody adds it, which is the cost of deriving the
check from data rather than from wording. `FormEngine` is also this repository's own engine
type, so in prose it is matched outside backticks only, and on the site's source only as its
domain.

## Alternatives considered

**Keep the comparison, dated.** What [0136](0136-the-angular-page-runs-the-starter.md) did for the
Angular page, and what 0141 reversed there for the same upkeep.

**Rewrite the history too.** Remove every name from the decision records and the changelog. It
would leave no file in the repository naming another product, at the price of records that no
longer say what was decided against, and of editing released changelog entries.
