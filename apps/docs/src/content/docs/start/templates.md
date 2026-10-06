---
title: Starter templates
description: Import reusable HR, sales, service, event, operations and healthcare administration forms, with translated text and executable examples.
---

Start with a working form, then adapt its questions and rules to your process.
The [template collection](https://github.com/sharkysan/formancy.ai/tree/main/templates)
contains plain formancy JSON documents, fictional sample answers and executable
behaviour cases. The repository's Apache-2.0 licence applies.

| Area | Templates |
| --- | --- |
| HR | Job application, employee onboarding, leave request |
| Sales | Sales enquiry, quotation request, customer onboarding |
| Customer service | Support request, complaint, satisfaction survey |
| Events | Registration, speaker submission, feedback |
| Operations | Expense claim, purchase request, equipment inspection |
| Healthcare administration | Appointment request, patient registration, referral intake |

## Open and adapt a template

Open [Templates](https://formancy.ai/templates/) to search, filter by area and
preview a form in English, Swiss High German or French. **Download JSON** gives
you the importable document directly. **Use template** opens the selected form
and language in the playground, where **Build** edits it and **Schema** exposes
the JSON. Both renderers start blank. The playground also lists the collection
in its **Demo** selector.

For a direct import, use the complete `*.form.json` document as the engine's
`schema` or the builder session's starting document. The
[React](/docs/start/react/) and [Angular](/docs/start/angular/) quickstarts show
the integration. Validate the JSON before constructing an engine, and choose a
new form `id` for each independent form you create.

These documents use frozen spec version 2. No required external uploader,
options source, named API check or AI provider is involved. The expense claim
and purchase request cover one item per submission; document fields accept
references rather than uploads. The purchase total is an estimate excluding
tax, currency conversion and invoice rounding.

## What is translated

Every authored field label, option, instruction and section heading has an
English (`en`), German (`de`) and French (`fr`) message. Choose the engine locale
to resolve them. The catalogue also supplies translated template titles and
summaries. The schema's plain `title`, the builder interface and the renderers'
error-code display are separate from these message catalogues.

## Examples that can be run

Each form has a `*.sample.json` containing fictional answers and a
`*.scenarios.json` describing changes to those answers and expected results.
Samples are for local evaluation, not production defaults or submission API
envelopes. The playground never loads them as answers.

The tests run each sample and scenario through the engine in client and server
modes. They verify conditional required fields, answers cleared when a branch
is hidden, invalid inputs, date ordering and calculated values where applicable.
Patient registration uses `today()` for birth-date validation; the host must
supply the chosen local date and replay the same capabilities on the server.

```bash
pnpm --filter @formancy/docs exec vitest run src/templates.test.ts
pnpm --filter @formancy/playground exec vitest run src/templates.test.tsx src/demos.test.ts
```

## Use AI to customise the starting point

Give a [coding agent](/docs/start/agents/) the template, its sample and the
`adaptBeforeUse` notes in the catalogue. Ask it to preserve existing field keys,
update every language and add scenarios for its new rules. Run `validate_form`
and `diff_forms`, then review the proposed change before publishing.

These are general-purpose starting points. The adaptation notes identify
organisation-specific choices such as leave categories, event formats and
approval processes. Healthcare entries cover administration only; their
executable examples do not establish clinical or legal suitability.
