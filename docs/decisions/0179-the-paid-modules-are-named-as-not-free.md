# 0179 — Two modules built on formancy are sold, and the landing page names them as not free

- **Status:** accepted
- **Date:** 2026-10-16
- **Supersedes in part:** [0003](0003-open-core-line.md) — its sold list as only operating the
  platform, and its "nothing to buy". Its free list, and the reason for it, stand.
- **Deciders:** Daniel Bacher
- **Verified by:** `apps/site/src/site.test.tsx`, *a link to a paid module says beside it that
  the module is not free*. It renders the page and finds every link whose address names either
  module, however it is spelled — `formancy.ai-data`, `formancy.ai-report`,
  `formancy.ai/data/`, `formancy.ai/report/`. It requires exactly the four links the page means
  to offer, each inside the list item that says "Not free" and "paid in production". It was
  written before the section existed and watched failing (no links). It was then watched
  failing again twice: with the terms line taken out of the items, and with a fifth link to
  `/report/` put in the paragraph above them. Nothing here checks the modules' licence
  terms. They were read from each repository's `LICENSE.md` on 2026-10-16, and if either
  changes, the page changes by hand.

## Context

[0003](0003-open-core-line.md) drew the commercial line at operating the platform. It listed
the sold side as managed hosting, multi-tenancy, SSO/SAML, audit logs, PDF and e-signature,
analytics and support. On 2026-09-19 it said every item on that list was unbuilt: "today there
is a great deal to adopt and nothing to buy."

Two products have since been built on formancy, each in a repository of its own and under a
source-available licence rather than Apache-2.0:

- **Formancy Data** turns an existing PostgreSQL or SQL Server database into formancy forms.
  Its licence has been in force since 11 October 2026, at version 1.1.
- **Formancy Report** designs paginated PDF reports from formancy forms, Formancy Data
  datasets or a host's JSON. It is the PDF item on 0003's list. Its licence has been in force
  since 14 October 2026, at version 1.

Both licences say the same thing in their first table. Reading the source, evaluating,
developing and testing are free, in a company too. Running the software in production needs a
paid licence, and there is no published price. Each module deploys its demo onto formancy.ai
from its own repository: `/data/examples/` and `/report/`. Formancy Data's
[0001](https://github.com/sharkysan/formancy.ai-data/blob/main/docs/decisions/0001-a-paid-module-in-its-own-repository.md)
says it owes this repository a record that amends 0003's sold list, so that "every item on it
is unbuilt" is updated rather than silently outgrown.

The landing page named neither product. A visitor could find them only from their repositories,
and the one sentence the page says about licensing is "Apache-2.0. The whole thing."

## Decision

0003's sold side gains modules that are built on the engine and sold separately, starting
with Formancy Data and Formancy Report. Nothing moves off the free list.

The landing page names both modules in its licence section, directly under the Apache-2.0
claim. Each module's item says "Not free · paid in production" beside its own links. The
section moved to `apps/site/src/licence.tsx` to make room, because `app.tsx` was at its size
ceiling.

## Consequences

**What it buys.** The paid modules appear where a visitor decides what is free, so an
evaluator learns that a module is paid before depending on it, not on the way to production.
Each item carries its own terms, so a link reached alone still says it. That covers a link
reached by tab or from a screen reader's list of links. And the record Formancy Data said
was owed now exists.

**What it costs.** Formancy Data is not on 0003's list, and it is not plainly *operating* the
platform: it is a server a developer runs in order to build forms over their own database.
The line is therefore no longer one principle. It is now "the engine, and everything needed to
evaluate and adopt it, is free; operating it, and the modules beside it, are sold", which is a
weaker sentence than 0003's. A self-hoster who wants forms generated from an existing database
now meets a price.

The page also states terms it cannot check. Both licences are unreviewed by a lawyer and say
so, and nothing in this repository fails if either one changes.

And the two pages it links are deployed by their own repositories. On 2026-10-16 both loaded
fonts from `fonts.googleapis.com` and `fonts.gstatic.com`; on 2026-10-17 both served their own
faces and named no other site, read from the pages and their stylesheets that day, as
formancy.ai-data 0072 and formancy.ai-report 0023 decide. [0154](0154-the-website-makes-no-request-to-any-other-site.md)'s
gate still opens only the pages this repository builds, so a visitor who follows these links
stays on formancy.ai but is covered by those repositories' gates, not by this one's, and nothing
here fails if either page asks another site for something again.

**What it forecloses.** Describing either module as part of formancy's open-source offer,
anywhere. It also forecloses moving either module into this repository without first
relicensing it under Apache-2.0 ([0002](0002-apache-2-0.md)).

## Alternatives considered

**A footer link, or a page of its own.** Rejected. The footer holds what somebody needs to
check the claims above it, and a separate page is one nobody reads before deciding. The visitor
asks what is free in the licence section, so the answer goes there.

**One "not free" sentence above both, with plain links below.** Rejected. A link is often
reached on its own, and the guard would then be a phrase somewhere on the page. That is the
shape of check that has passed here for the wrong reason before. Each item says its own terms,
and the test reads them from the item that holds the link.

**Not linking them until there is a price.** Rejected. "No published price, ask" is something a
visitor can act on. Both modules are released and their demos are already served on
formancy.ai.

**Superseding 0003 whole.** Rejected. Its free list and its argument, that the paywall must not
stand in front of the evaluation, are unchanged. Only the sold list and the sentence about there
being nothing to buy have moved.
