# 0105 — Keep templates as documents with executable examples

- **Status:** accepted
- **Date:** 2026-10-06
- **Deciders:** Daniel Bacher
- **Verified by:** `apps/docs/src/templates.test.ts`, `apps/playground/src/demos.test.ts`, `apps/playground/src/templates.test.tsx`, `apps/site/src/template-gallery.test.tsx`, and `scripts/template-browser-test.mjs` through `pnpm test:browser`; `pnpm build:web` checks the gallery entry point and sitemap.

## Context

An integrator needs a useful starting form before an editor is useful. A form
that looks plausible can still contain an inverted condition or a rule that
fails for every non-empty answer. Schema validation alone did not catch the
first patient-registration draft comparing a date string with `today()`'s CEL
timestamp; executing the supplied sample did.

A collection hidden inside the playground asks a visitor to enter an editing
tool before they can decide which form to use.

## Decision

Keep each template as a plain spec-2 JSON document, with a separate fictional
sample and executable scenarios. A catalogue supplies discovery metadata and
adaptation notes; it is not part of the form format. Validate samples and cases
with the same engine in client and server modes, including exact error codes
and answers removed when branches become hidden.

Offer a dedicated `/templates/` entry point with search, area filters, local
previews and JSON downloads. The gallery preview, download and playground read
the same form file. Editing is a link into the playground carrying a template
id and locale; it never fetches an arbitrary URL from the query string.

## Consequences

**What it buys.** Templates can be copied into either framework without a new
package, service or generator. The frozen spec version avoids making adoption
depend on the open version 4. Form text is translated independently of stable
field keys and option values. Fictional answers cannot become defaults merely
by choosing a template.

**What it costs.** The collection needs editorial maintenance: tests cannot
certify the suitability of questions, legal wording or clinical use. Samples
and scenario expectations must be maintained with the rules. The gallery has a
separate presentation to maintain and loads the small collection eagerly; a
substantially larger catalogue would need loading by template.

**What it forecloses.** No claim that these are official forms or that they
implement a complete business process. Expense and purchase starters cover one
item, and healthcare starters are administrative. There is no AI service at
runtime; an author can use the existing MCP tools to adapt and revalidate the
same documents.

## Alternatives considered

**Only examples in the playground.** Rejected: a visitor should be able to find,
preview and download a form without opening an editor.

**Generate a fresh form on every visit.** Rejected: a repeatable starting point
needs stable keys, translations and examples that can be executed before it is
shown. Model access remains the host's choice.

**A template-specific schema or published package.** Rejected: the existing
form document already contains the needed contract. Another format or package
would make import and versioning harder without adding behaviour.
