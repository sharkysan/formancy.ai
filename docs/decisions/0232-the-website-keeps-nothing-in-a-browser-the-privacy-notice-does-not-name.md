# 0232 — The website keeps nothing in a browser the privacy notice does not name

- **Status:** accepted
- **Date:** 2026-11-04
- **Extends:** [0154](0154-the-website-makes-no-request-to-any-other-site.md), whose browser gate
  this adds two checks to
- **Deciders:** Daniel Bacher
- **Verified by:** `scripts/request-browser-test.mjs`, run by `pnpm test:browser`. After each page
  it opens, it reads every cookie the browser holds and every key in local and session storage and
  every IndexedDB database in each frame, and fails on one the privacy notice does not name; the
  notice names one, the documentation's `starlight-theme`. With nothing allowed it failed on the
  documentation page, `it kept localStorage starlight-theme`, so it reads what a page stores; with
  a cookie, a session key and a database written by the built landing page, it named all three.
  And it fails when `/privacy/` does not name a key it allows: it failed on the notice as it stood,
  which named none.

## Context

The legal notice and the privacy notice went up as drafts (#277), with their open questions in
brackets: whether Cloudflare's analytics, Zaraz or Turnstile run, which cookies are set, where mail
goes, what is kept and for how long. Formancy Data, Report and Health link both notices from their
own pages, and each holds the same draft list.

Most of those questions have an answer that can be read rather than assumed. 0154's gate already
holds that no page asks another site for anything. Read from the live site on 2026-11-04: no
response set a cookie, no page held an analytics, Zaraz or Turnstile script, Cloudflare sent a
Network Error Logging header, and the domain's mail is received by Cloudflare Email Routing (its
MX and SPF records). What a page keeps in the browser was read by nothing.

## Decision

The notices say what was checked, and nothing they cannot back. What a page keeps in a visitor's
browser is held by the browser gate: nothing but what the privacy notice names, today the
documentation's theme choice. What only the live deployment shows, Cloudflare's headers and mail
routing, is stated with the date it was read. The facts only the operator has, that there is no
register entry or VAT number and how long mail is kept, are the operator's answers.

## Consequences

**What it buys.** A statement on the privacy page that the site keeps nothing else fails a check
when it stops being true, and so does a key allowed by the check that the page does not name. The
drafts' brackets are gone, and the three products' pages point at notices that say something.

**What it costs.** The live facts can go stale without a test noticing: a Cloudflare setting turned
on in the dashboard sets a cookie or adds a script, and only reading the site again finds it,
because a check needing the network answers differently in CI. The notice says when it was read.
The gate reads the pages it opens, one of each kind, and the legal pages are not among them; they
have no script. Where mail is forwarded after Cloudflare is named only as the operator's own
mailbox.

**What it does not do.** It is not a legal review, and claims none: the operator approved the
pages. It opens none of the demonstrations of Data, Report and Health, which formancy.ai serves at
`/data/examples/`, `/report/` and `/health/` from each product's own repository and whose own
browser checks hold their requests; the notice states what was read of them on 2026-11-04, that
none set a cookie, none of their bundles uses browser storage, and each requests only its own
files.

## Alternatives considered

**Keep the drafts until a lawyer reads them.** Rejected by the operator: the brackets were
questions with answers, and a published draft says less than the facts.

**A cookie banner.** Rejected: there is nothing optional to consent to, and the gate holds that
there stays nothing.

**State the live facts without a date.** Rejected: they hold for the deployment on the day they
were read, and nothing here re-reads them.
