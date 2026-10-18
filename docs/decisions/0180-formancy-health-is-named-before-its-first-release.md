# 0180 — Formancy Health is named beside the other paid modules, before its first release

- **Status:** accepted
- **Date:** 2026-10-18
- **Deciders:** Daniel Bacher
- **Verified by:** `apps/site/src/site.test.tsx`. *A link to a paid module says beside it that
  the module is not free* now names `formancy.ai/health/` and `formancy.ai-health` among the
  links it requires, each inside an item that says "Not free" and "paid in production"; with
  the test changed and the page not, it failed (`expected [ …(4) ] to deeply equal [ …(6) ]`).
  *A page that uses HL7's marks says whose they are* reads the rendered page and requires
  HL7's attribution sentence on it; it failed before the item existed, on the page naming
  neither mark. Nothing here checks Formancy Health's licence, its release state or what its
  demo serves.

## Context

[0179](0179-the-paid-modules-are-named-as-not-free.md) put Formancy Data and Formancy Report
under the licence claim, each item saying it is not free, and its decision reads "starting
with" those two. A third module now exists:

- **Formancy Health** exports formancy forms, their submissions and Formancy Report PDFs as
  HL7® FHIR® R4 resources, shaped to a country's profiles — Switzerland's CH Core and CH ORF
  are the ones built. Its licence, version 1, is in force from 16 October 2026 and states the
  same terms as Data's 1.1 and Report's 1 in its first table: reading, evaluating and
  developing are free, in a company too; production needs a paid licence; there is no
  published price, and the address to ask is `info@formancy.ai`. Read from its `LICENSE.md`
  on 2026-10-18.
- Its demo is served at `formancy.ai/health/` by a Worker its own repository deploys on every
  push to its `main`, so it is that branch's demo and can be ahead of a release.
- On 2026-10-18 it is **not released**: its README says 0.1.0 is ready to tag, and nothing is
  on npm.

That last fact is what makes this a decision of its own rather than a line added to 0179.
0179 rejected waiting for a price partly because "both modules are released and their demos
are already served on formancy.ai". Half of that is true of Formancy Health.

Formancy Health is described by the standard it implements, and HL7 asks every use of its
marks that is not its own to say they are HL7's and that their use is no endorsement. Formancy
Health's `NOTICE` quotes that sentence from the FHIR licence page, read there on 16 October
2026.

## Decision

The licence section lists Formancy Health as a third item, in the same shape as the other two:
the terms line, a link to its demo and one to its repository. Its item also carries HL7's
sentence, as Formancy Health's `NOTICE` gives it. The sentence above the items says "the
modules built on formancy" and no longer counts them.

## Consequences

**What it buys.** A visitor deciding what is free meets every paid module there, Formancy
Health included, and can try its demo, which needs nothing installed. The trademark line
travels with the words that need it, so it is said wherever the item is read.

**What it costs.** The page links a module that cannot be installed yet, and its item does not
say so. That state lives in another repository and changes on the day it is tagged, and
nothing here can read it; a visitor who follows either link is told it at the top of Formancy
Health's README rather than here. The licence terms and HL7's sentence are copied, and nothing
here fails if either changes at its source.

Formancy Health's subject is health records, and it sits one paragraph above the sentence
that says formancy is not a medical device. That sentence is about formancy and stays so.
This page claims nothing about Formancy Health's regulatory position; its README states its
own intended purpose.

Its demo page is covered by Formancy Health's gates and not by
[0154](0154-the-website-makes-no-request-to-any-other-site.md)'s, which opens only the pages
this repository builds. Read from its response on 2026-10-18, its content security policy was
`default-src 'none'`, with scripts, styles and fonts allowed only from
`https://formancy.ai/health/assets/` and `connect-src 'none'`, so a browser would refuse it
any request to another site. Nothing here fails if that changes.

**What it forecloses.** Describing Formancy Health as released, or as part of formancy's
open-source offer, anywhere on the page; and saying anything on the page about its fitness for
a regulated use.

## Alternatives considered

**Waiting for its 0.1.0 release.** Rejected. Its demo and its source are public already, and
evaluating it is what its licence gives away. A release changes what can be installed, not
what a visitor can try or read.

**Saying "not released yet" on its item.** Rejected. That is true on the day it is written and
false on the day the module is tagged, in a repository whose state nothing here can check. A
wrong sentence about another product on this page is worse than an absent one, and the
module's README says it first.

**Describing it without naming FHIR, so the page owes no trademark line.** Rejected. The
standard is what the module is for. A description without it says nothing a buyer would
recognise.

**Amending 0179.** Rejected. Part of 0179's argument for linking rested on both modules being
released. That is not true of this one, so its reasoning is different and gets a record of its
own.
