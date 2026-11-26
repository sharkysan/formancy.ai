# 0245 — A product page says what its module makes and does, and leaves what it does not do yet to the module's own pages

- **Status:** accepted
- **Date:** 2026-11-26
- **Deciders:** Daniel Bacher
- **Supersedes in part:** [0242](0242-each-paid-module-has-a-product-page-sent-as-static-html-and-the-landing-page-shows-what-each-makes.md),
  whose product pages said, beside the module's status, what it does not do yet, each absence as
  a buyer would ask it; the rest of 0242 stands
- **Verified by:** each watched failing on 2026-11-26, its fault planted once and the file put back
  byte for byte:
  - **`apps/site/src/product-page.test.tsx`**, for each of the three pages. *Says, in this order,
    what the module makes, does and is for, its status and its terms, and nothing of what it does
    not do yet* reads four things from the rendered page and holds each to what the module's file
    gives it: the name of every part of `<main>`, in order, the hero's heading, then *What it
    makes*, *What it does*, *What teams use it for*, *Who it is for*, *How it fits with formancy*,
    *Status*, *Terms* and *Try it, then ask about production*; every heading in `<main>`, each a
    part's or a capability's; every item of every list outside the example, each a link of the
    hero's, a capability, a link to the module's own pages or a job; and the status, element by
    element, its heading, the release's line, the release's own sentence and the date it was
    read. Failed on all three against the pages as they were (`+ "What it does not do yet"`),
    with a part *Limitations* put back before *Terms* (`+ "Limitations"`), with a list of
    absences under a class of its own in *Status* and another in *Who it is for*
    (`expected [ …(25) ] to deeply equal [ …(24) ]` on Data's page), with a heading *Limits
    today* inside *How it fits with formancy* (`expected [ …(18) ] to deeply equal [ …(17) ]`),
    and with a paragraph of absences in *Status* (`expected [ Array(5) ] to deeply equal
    [ Array(4) ]`). *Says its release in its status, a developer preview as one, and dates it*
    requires the release's own sentence in *Status* too, and the "developer preview" mark
    exactly where the release is one: failed on Report's and Health's pages with the mark taken
    out (`expected [] to have a length of 1 but got +0`), and passed on Data's, which is not
    one. *Formancy Health's page says, where it says who the module is for, that it is not
    intended as a medical device*, read from that part of the rendered page: failed before the
    sentence was written there, and with it moved into the status's sentence
    (`Expected: "It is not intended as a medical device."`).
  - **`pnpm typecheck`**: `Product` has no field for a module's absences, so a module's file that
    gives one is refused (failed with a `notYet` list put back in Data's: `Object literal may only
    specify known properties, and 'notYet' does not exist in type 'Product'`). The field put back
    on `Product` passes it, and a list that nothing draws passes the tests above: that is review's.
  - **`pnpm test:browser`** (`scripts/product-pages-browser-test.mjs`), its check run alone
    against the planted build: at 320, 390, 820, 1180 and 1440 pixels no part of a product page
    is narrower than three quarters of the row `<main>` gives it with no other part beside it.
    Failed on all three pages at 1180 and 1440 with *Status* left alone in a row of two
    (`alone in half a row: status`); below 60rem the parts stand one above the other, and it
    passed there.

  An absence written as words into what a module's file gives a part, a capability's detail, a
  job, *Who it is for*, *How it fits with formancy* or the release's sentence, fails none of
  these and is held by review alone. Nothing here reads the modules' repositories: that each
  module's own pages say what it does not do yet, and that Health's README states the intended
  purpose this page quotes, was read from each on 2026-11-25 and 2026-11-26, and nothing here
  fails if one stops saying it.

## Context

[0242](0242-each-paid-module-has-a-product-page-sent-as-static-html-and-the-landing-page-shows-what-each-makes.md)
gave Formancy Data, Formancy Report and Formancy Health each a product page on formancy.ai, which
said, in order, what the module makes, what it does, what teams use it for, who it is for, how it
fits with formancy, its status, what it does not do yet, and its terms, and ended on the
demonstration and a question about a production licence. *What it does not do yet* was a list
beside *Status*, the two parts in one row from 60rem: Data's databases and the writes a
PostgreSQL table without a version column refuses, Report's output formats and scripts, Health's
one country and its missing PDF/A, each module's untested settings, and that no lawyer has
reviewed its licence. Health's list ended on "It is not an EHR, a FHIR server or a terminology
service, and it is not intended as a medical device.", the sentence its README gives under
*Intended purpose*.

Looking at the pages on 2026-11-26, the owner said: "What it does not do yet remove from product
pages." The product pages are sales pages, the place a buyer decides whether to try a module, and
how much of a module's shortfall they show is a call about selling it, which is the owner's. Each
module's own pages go on saying it, in the module's own voice and with its reasons: Data's
README under *What it does not do yet* and its guide's status and tested-on pages; Report's start
page at `/report/<language>/` under *What it does not do yet*, and its roadmap for what comes
next; Health's README under *Not in 0.1.0* and *Intended purpose*. Each product page already
links them: Data's tested-on page from *What it does*, and its README as the repository the hero
links; Report's start page from the hero and from *What it does*; Health's README's *What 0.1.0
is, and is not* and *Its intended purpose* from *What it does*.

A medical device's intended purpose is, under the MDR's Article 2(12), read from what its
manufacturer says of it, promotional and sales material among it. Health's README says what
Health is for, and that it is not intended as a medical device, in a part of its own: that
sentence is not a thing Health does not do yet, which a release could fill, but what it is for.

## Decision

**A product page has no part on what its module does not do yet.** The three pages lose *What it
does not do yet*; `Product`, in `apps/site/src/products/product.ts`, loses the field that held
the absences, and the modules' files their lists, so no data stands behind a part the page no
longer draws. No absence moves into another part: not into *Status*, *What it does* or *Terms*.
A capability that already said what bounds its own claim keeps saying it, as Health's validator
says it runs with no terminology server, so a code from LOINC, SNOMED CT or UCUM is not checked:
that is the capability said truly, not an absence moved.

**Health's page keeps its intended purpose.** *Who it is for*, which says who Health is for and
that it is a library, not a server, ends on "It is not intended as a medical device.", in its
README's words. It is the one sentence of the old list that stays, because it was never an
absence; the rest of that sentence, that Health is not an EHR, a FHIR server or a terminology
service, goes with the absences, *Who it is for* already saying it is a library and not a server.

**The status stands alone, across the page**, as *What teams use it for* and *Terms* do, rather
than as the half of a row whose other half is gone, its words at reading width as *Terms*'s are.
It keeps all it said: the release, its date, the "developer preview" mark on Report's and
Health's, the release's own sentence, Health's "A developer preview, not yet for the production
export of a person's record. No lawyer has read the licence, the intended purpose or the
trademark position." among them, and the date it was read on. *Who it is for* and *How it fits
with formancy* keep their row of two. The stylesheet's rules for the list of absences go with it.

Nothing else changes. The terms are where 0179, 0241 and 0242 put them, "Not free · paid in
production" beside every link to a module and "Source-available, not open source" in *Terms*; the
landing page's cards never listed absences; and the share cards draw a page's heading, its terms
and its example, not the list, so none is taken again.

## Consequences

**What it buys.** The page reads as what a buyer is offered, from what the module makes to its
terms and the next step, without a list of what is missing between its status and its terms. It
states fewer facts about three other repositories that nothing here reads again, and the ones it
drops were the likeliest to go stale: an absence is the claim a module's next release fills, and
the page would have gone on saying it with no gate here failing.

**What it costs.** A buyer who reads only the product page no longer sees there what the module
does not do: that Data reads and writes PostgreSQL and SQL Server and no other database, that
Report writes PDF and Word and sends nothing, that Health writes Switzerland's profiles alone,
no PDF/A and is tested under Node only, and that Health is not an EHR, a FHIR server or a
terminology service. They are on the module's own pages, one link away, and a buyer who does not
follow it can take the page's silence for "it does". What still says a module is unfinished on
its page is its status, the "developer preview" mark and the release's own sentence, and "Not
reviewed by a lawyer" in the licence's line under *Terms*; and Health's page still says it is
not intended as a medical device.

The pages now say less of what a module does not do than this repository's own documents are asked
to say of formancy. They are about other repositories and are written to sell them; the owner
decided that, and the modules' pages, which say it in full, are where a reader checks. The pages
and the modules' pages still describe the same modules in two places that can disagree, as 0242
says, now on fewer points; Health's intended purpose is one of them, copied, and nothing here
fails if Health's README words it otherwise.

**What it forecloses.** A part on a product page that lists what its module does not do, under that
heading or another, and the list folded into another part, without a record that undoes this one.
A product page's status as one half of a row with nothing beside it. Health's page without its
intended purpose.

## Alternatives considered

**Keep it.** Rejected: it is the owner's call, and the module's own pages already say each absence
in full, with its reason and in the module's words, where its next release updates it.

**Move it lower, after the terms, or into a disclosure a reader opens.** Rejected: it would still
be on the page, which is what the owner asked to go. A closed disclosure hides the list from a
reader without taking it off the page, and from a crawler not at all.

**Fold it into *Status*: a sentence or two on the largest absences.** Rejected: the same list under
another heading. *Status* says where the release stands, and keeps saying it.

**Link out: a line in *Status* such as "What it does not do yet, on its own pages".** Rejected: it
keeps the subject on the page as a line with no part of its own, and the links the page already
has, to each module's guide, README, start page and repository, lead to the same pages.

**Take Health's "not intended as a medical device" off with the rest.** Rejected: it is Health's
intended purpose, not something it does not do yet, and a page that sells referrals and a
patient's answers is the material a reader would read an intended purpose from. Kept where the
page says who Health is for, the only words of the old lists left on any page, and named here so
that taking them off too is a decision of its own.

***Status* left in its row of two with the other half empty, or paired with another part.**
Rejected. An empty half reads as something missing, which it now would be. *Terms* holds the
licence's table, which needs the page's width, and pairing *Status* with *How it fits with
formancy* would leave *Who it is for* alone instead.
