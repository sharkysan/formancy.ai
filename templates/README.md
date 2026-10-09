# Starter form templates

Reusable starting forms for HR, sales, customer service, events, operations and
healthcare administration. The JSON documents carry their own field labels,
choices, section layout, validation and conditional questions — and the job
application is a wizard, its questions on pages answered a step at a time. English (`en`),
Swiss High German (`de`) and French (`fr`) catalogues are complete for the
text authored in these forms.

These are general-purpose starting points, not official industry standards or
approved organisational procedures. Each catalogue entry lists what to adapt.
They use the frozen **spec version 2**, so they do not require the open version
4 or its newer widgets. The repository's Apache-2.0 licence applies.

## Try one

1. Open [Templates](https://formancy.ai/templates/) after deployment, or run
   `pnpm --filter @formancy/site dev` and open `http://localhost:4384/templates/`.
2. Filter by area or search, choose the template language, and preview a form.
   **Download JSON** gives you the complete importable document.
3. **Use template** opens that document and language in the playground. In local
   development also run `pnpm --filter @formancy/playground dev`. Both Angular
   and React render it, initially blank. Use **Build** to adapt it or **Schema**
   to copy the JSON. The playground's **Demo** selector also lists the collection.

To import directly, copy a `*.form.json` file and pass the parsed, validated
object as the `schema` to `createFormEngine`, or to `createBuilderSession`.
Use the existing [React](../apps/docs/src/content/docs/start/react.md) or
[Angular](../apps/docs/src/content/docs/start/angular.md) integration guide.
The documents are also valid input for the admin's schema editor. Do not import
`catalog.json`, a sample, or a scenario file as a form.

Choose a new `id` when creating a separate form from a template. Keep field keys
and option values stable once answers have been collected; translate labels
rather than those identities.

## Collection

| Area | Template | Sample answers | Behaviour cases |
| --- | --- | --- | --- |
| HR | [Job application](hr/job-application.form.json) | [JSON](hr/job-application.sample.json) | [JSON](hr/job-application.scenarios.json) |
| HR | [Employee onboarding](hr/employee-onboarding.form.json) | [JSON](hr/employee-onboarding.sample.json) | [JSON](hr/employee-onboarding.scenarios.json) |
| HR | [Leave request](hr/leave-request.form.json) | [JSON](hr/leave-request.sample.json) | [JSON](hr/leave-request.scenarios.json) |
| Sales | [Sales enquiry](sales/lead-enquiry.form.json) | [JSON](sales/lead-enquiry.sample.json) | [JSON](sales/lead-enquiry.scenarios.json) |
| Sales | [Quotation request](sales/quotation-request.form.json) | [JSON](sales/quotation-request.sample.json) | [JSON](sales/quotation-request.scenarios.json) |
| Sales | [Customer onboarding](sales/customer-onboarding.form.json) | [JSON](sales/customer-onboarding.sample.json) | [JSON](sales/customer-onboarding.scenarios.json) |
| Customer service | [Support request](customer-service/support-request.form.json) | [JSON](customer-service/support-request.sample.json) | [JSON](customer-service/support-request.scenarios.json) |
| Customer service | [Customer complaint](customer-service/complaint.form.json) | [JSON](customer-service/complaint.sample.json) | [JSON](customer-service/complaint.scenarios.json) |
| Customer service | [Customer satisfaction](customer-service/satisfaction-survey.form.json) | [JSON](customer-service/satisfaction-survey.sample.json) | [JSON](customer-service/satisfaction-survey.scenarios.json) |
| Events | [Event registration](events/registration.form.json) | [JSON](events/registration.sample.json) | [JSON](events/registration.scenarios.json) |
| Events | [Speaker submission](events/speaker-submission.form.json) | [JSON](events/speaker-submission.sample.json) | [JSON](events/speaker-submission.scenarios.json) |
| Events | [Event feedback](events/feedback.form.json) | [JSON](events/feedback.sample.json) | [JSON](events/feedback.scenarios.json) |
| Operations | [Expense claim](operations/expense-claim.form.json) | [JSON](operations/expense-claim.sample.json) | [JSON](operations/expense-claim.scenarios.json) |
| Operations | [Purchase request](operations/purchase-request.form.json) | [JSON](operations/purchase-request.sample.json) | [JSON](operations/purchase-request.scenarios.json) |
| Operations | [Equipment inspection](operations/equipment-inspection.form.json) | [JSON](operations/equipment-inspection.sample.json) | [JSON](operations/equipment-inspection.scenarios.json) |
| Healthcare administration | [Appointment request](healthcare-administration/appointment-request.form.json) | [JSON](healthcare-administration/appointment-request.sample.json) | [JSON](healthcare-administration/appointment-request.scenarios.json) |
| Healthcare administration | [Patient registration](healthcare-administration/patient-registration.form.json) | [JSON](healthcare-administration/patient-registration.sample.json) | [JSON](healthcare-administration/patient-registration.scenarios.json) |
| Healthcare administration | [Referral intake — administration](healthcare-administration/referral-intake.form.json) | [JSON](healthcare-administration/referral-intake.sample.json) | [JSON](healthcare-administration/referral-intake.scenarios.json) |

## Files and integration

- **`*.form.json`** is the importable form document, with no wrapper or sample
  answers embedded in it.
- **`*.sample.json`** is a fictional value object for `initialValue` during local
  evaluation. It is not a submission API envelope, and it must not become a
  production form's defaults. Names, identifiers and `example.com` addresses
  are illustrative; the placeholder phone number is not dialable.
- **`*.scenarios.json`** describes changes to that sample and the expected
  validity, exact error codes, field visibility, computed values and removed
  answers. The docs test suite executes them in both client and server modes.
- **`catalog.json`** lists paths, translated titles and summaries, locale codes,
  and per-template adaptation notes. Its `collectionVersion` is independent of
  each document's `specVersion` and your server's published form versions.

There is no required uploader, external options source, API check or AI provider.
The job application accepts an optional CV/profile URL. Expense and referral
forms collect a reference to a document in the host organisation's system;
they do not upload or retrieve it. The expense claim and purchase request each
cover one item per submission.

The engine still needs a capability source when there are logic rules. Patient
registration uses `today()` to reject a future date of birth: supply the date
for the deployment's chosen time zone, and capture/replay the same capabilities
for server validation. Other templates use no clock. The fixed date in the
tests exists to make those examples reproducible, not to set a production clock.

Form text is translated; the builder's own controls and built-in error UI are
outside this collection. The current renderers display validation error codes.
The schema's `title` is a plain English string; `catalog.json` provides translated
titles for a host that wants to display them. Use `locale: 'de'` or `locale: 'fr'`
on the engine to resolve the field and section text.

The purchase estimate is recalculated from quantity and unit price. It excludes
tax, conversion and invoice rounding; it is an estimate, not an accounting
calculation. Samples do not create accounts, reserve seats, approve requests,
send messages or place orders. Those actions belong to the host application.
Healthcare templates collect administrative details only. Their tests establish
schema and specified engine behaviour, not clinical or legal suitability.

## Adapt with AI

Give the coding agent a `*.form.json` and its catalogue adaptation notes, then
ask for a specific change, for example:

> Adapt the event registration for an onsite workshop. Keep the existing field
> keys, add a required company name only when an invoice is requested, and
> update English, German and French text. Return the complete form JSON and
> positive and negative examples for the new branch.

Use formancy's [MCP tools](../apps/docs/src/content/docs/start/agents.md) to
validate the changed document and compare it with its source. Review the rules
and examples before publishing. `diff_forms` reports data compatibility; it does
not determine whether a question is appropriate for your organisation.

## Verify changes

From the repository root, after installing dependencies and building packages:

```bash
pnpm --filter @formancy/docs exec vitest run src/templates.test.ts
pnpm --filter @formancy/playground exec vitest run src/templates.test.tsx src/demos.test.ts
```

The tests check schema validation, engine compilation, expression checks,
complete referenced translations, catalogue/file agreement, sample submission,
branch clearing and specified rejected inputs. The playground tests exercise
translated fields and conditional behaviour under both renderers. Keep the
sample and cases beside the form when adapting it; changing a rule without
changing its expected examples is meant to fail.
