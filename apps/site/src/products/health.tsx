import { PLAYGROUND } from '../chrome.js'
import { HealthExample } from '../module-examples/health.js'
import type { Product } from './product.js'
import { HL7_MARK, github } from './product.js'

/**
 * `/products/health/` (0242), read from formancy.ai-health on 2026-11-25 at 0.1.0's `main`:
 * each capability names what its README's *What it does* and the packages under
 * `packages/health-*` do today, and each absence what *Not in 0.1.0* and *Intended purpose*
 * say, and the validator's caveat what its README's *The validator gate* says offline leaves
 * unchecked. HL7's marks name the standard and never the module, a page or an address (Health
 * 0003), so the title says "FHIR R4 resources"; and the page carries HL7's sentence word for
 * word. A German word is marked `lang="de"`, so a screen reader does not say it as English. If the module changes, this changes by hand.
 */

const REPOSITORY = 'formancy.ai-health'
const DEMO = 'https://formancy.ai/health/'
const README = github(REPOSITORY, 'README.md')

export const HEALTH: Product = {
  page: 'health',
  name: 'Formancy Health',
  repository: REPOSITORY,
  title: 'Formancy Health: forms and PDFs as FHIR R4 resources',
  description: 'Export formancy forms and answers as HL7® FHIR® R4 SDC resources, PDFs in a FHIR document Bundle, and Swiss referrals as CH ORF on CH Core.',
  h1: (
    <>
      Forms, answers and PDFs, <em>exported to the HL7® FHIR® standard</em>
    </>
  ),
  lede:
    'Formancy Health turns a formancy form into an SDC Questionnaire, a person’s answers into its QuestionnaireResponse, and a PDF, such as a ' +
    'Formancy Report referral letter, into a DocumentReference in a document Bundle. A Swiss referral is written as CH ORF 3.0.2 on CH Core 6.0.0. It ' +
    'is a library: your application calls it, gets FHIR R4 JSON back and sends it itself.',
  ctas: [
    { label: 'Try the demo', href: DEMO },
    { label: 'Read the getting-started guide', href: github(REPOSITORY, 'docs/getting-started.md') },
    { label: 'Source on GitHub', href: github(REPOSITORY) },
  ],
  example: {
    figure: <HealthExample variant="page" />,
    real: { label: 'Try the demo, which makes these resources in your browser', href: DEMO },
  },
  capabilities: [
    {
      label: 'A formancy form as an SDC Questionnaire',
      detail:
        'A form becomes an SDC 4.0.0 Questionnaire (HL7’s Structured Data Capture guide), one item per field, translated into the languages the host ' +
        'asks for. A form that cannot be one is refused whole.',
    },
    {
      label: 'A submission as a QuestionnaireResponse',
      detail:
        'A person’s answers become a QuestionnaireResponse to that Questionnaire, each answer of its item’s type. It is refused whole where an answer ' +
        'cannot be one.',
    },
    {
      label: 'A PDF in a DocumentReference, and a document Bundle',
      detail:
        'A PDF, such as a Formancy Report referral letter, is carried by its own bytes. A document Bundle holds the Composition first and then only ' +
        'what it refers to, every reference resolved.',
    },
    {
      label: 'Swiss referrals as CH ORF 3.0.2 on CH Core 6.0.0',
      detail:
        'A referral is written as HL7 Switzerland’s Order & Referral by Form document, with its patient and author in CH Core’s profiles and its ' +
        'orders in CH ORF’s.',
    },
    {
      label: 'GLN and AHV numbers checked',
      detail: 'A GLN or an AHV number whose form or check digit is wrong is refused, where the HL7 FHIR validator only warns.',
    },
    {
      label: 'Refused whole, never half exported',
      detail: 'What a profile cannot say refuses the whole export, with every refusal at once, each naming where it is and never quoting a value.',
    },
    {
      label: 'Every digit kept',
      detail: 'A decimal travels as its text, so 70.50 stays 70.50, never through a JavaScript number, and the same input gives the same bytes.',
    },
    {
      label: 'Judged by the HL7 FHIR validator',
      detail:
        'A gate of its own runs the HL7 FHIR validator offline, against guide packages pinned by SHA-256, over what the packages write of a synthetic ' +
        'corpus. It runs with no terminology server, so a code from LOINC, SNOMED CT or UCUM is not checked.',
    },
  ],
  further: {
    lede: 'Formancy Health’s README says each of these in full, with the decision record behind it.',
    links: [
      { label: 'What it does', href: `${README}#what-it-does` },
      { label: 'What 0.1.0 is, and is not', href: `${README}#what-010-is` },
      { label: 'Its intended purpose', href: `${README}#intended-purpose` },
      { label: 'The validator gate', href: `${README}#the-validator-gate` },
      { label: 'The formats it targets', href: `${README}#the-formats-it-targets` },
    ],
  },
  jobs: [
    <>
      Sending a Swiss referral (<span lang="de">Zuweisung</span>) to a specialist as a CH ORF document
    </>,
    'Publishing a formancy form to a partner system as an SDC Questionnaire, in several languages',
    'Handing a FHIR server the QuestionnaireResponse of a submission, which your application sends',
    'Attaching a Formancy Report referral letter PDF to a FHIR document Bundle',
    'Catching a wrong GLN or AHV check digit before the document leaves your application',
  ],
  whoFor: (
    <>
      Vendors of the software that hospitals, clinics and practices run. Their forms, a patient’s answers and the letters they print have to leave the
      application as FHIR R4 JSON for a Swiss partner system: a referral (<span lang="de">Zuweisung</span>) as CH ORF, its people in CH Core. The vendor’s
      application calls the packages, gets the JSON back and sends it itself. It is a library, not a server.
    </>
  ),
  fits: [
    'formancy — the spec, the engine, the renderers, the builder and the backend — is Apache-2.0 and free, and stays so. Formancy Health depends on ' +
      'its released packages at exact versions and copies none of their code.',
    <>
      Its packages depend on one another and on formancy’s <code>@formancy/spec</code> alone, with no framework, no Node API and no network call. Your
      application hands them a form, its answers, a PDF or a referral, and sends what they give back. Formancy Report and Formancy Data are optional beside it:
      a host that exports only forms needs neither.
    </>,
    <>
      The forms it exports are formancy’s: build one in the <a href={PLAYGROUND}>playground</a>.
    </>,
  ],
  release: {
    version: '0.1.0',
    date: '2026-10-19',
    preview: true,
    said:
      'A developer preview, not yet for the production export of a person’s record. No lawyer has read the licence, the intended purpose or the ' +
      'trademark position.',
  },
  notYet: [
    'No PDF/A, and so no documents for Switzerland’s electronic patient record (CH EPR): every PDF/A declaration is refused.',
    'Switzerland only: CH Core and CH ORF are the only national profiles. Germany’s are planned next; the United Kingdom’s, Austria’s and ' +
      'Europe’s only when a customer pays for them.',
    'No extraction: no resource is made from the answers in a QuestionnaireResponse.',
    'File, signature, ranking, matrix and rich-text fields refuse the form. There is no FHIRPath, and a computed field is exported read-only.',
    'Parts of CH ORF are refused: the Questionnaire is not put in the Bundle, and a PDF, the receivers and the contacts are refused in a CH ORF document.',
    'It is a library with no server, page or transport: your application sends what it writes.',
    'Tested under Node only: every gate runs the packed packages there, so no browser is claimed.',
    'It is not an EHR, a FHIR server or a terminology service, and it is not intended as a medical device.',
  ],
  licence: {
    line: 'Formancy Health Source-Available Licence, Version 1, in force from 16 October 2026. Not reviewed by a lawyer.',
    rows: [
      ['Read the source and fork the repository', 'Free'],
      ['Evaluate, develop and test — including in companies', 'Free'],
      ['Run in production, internally or customer-facing', 'Paid licence'],
      ['Redistribute inside another software product', 'Separate commercial agreement'],
      ['Customer data, health records and generated FHIR resources', 'Remain the customer’s'],
    ],
    howToBuy:
      'Production licences are requested from the Rightsholder at info@formancy.ai, as section 9 of the licence says. There is no published price. ' +
      'Formancy Report’s and Formancy Data’s packages keep their own licences: a host running them beside these needs that product’s production ' +
      'licence as well.',
  },
  // Report's page on its healthcare documents, in a group named by Report's terms rather than
  // Health's, since it leads to the other module.
  related: {
    name: 'Formancy Report',
    link: { label: 'Formancy Report’s letters and reports for healthcare', href: 'https://formancy.ai/report/en/healthcare/' },
  },
  mark: HL7_MARK,
}
