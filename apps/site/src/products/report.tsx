import { PLAYGROUND } from '../chrome.js'
import { ReportExample } from '../module-examples/report.js'
import type { Product } from './product.js'
import { github } from './product.js'

/**
 * `/products/report/` (0242), read from formancy.ai-report on 2026-11-25 at 0.3.0's `main`:
 * each capability names what its README and the packages under `packages/` do today, and
 * each absence what its README, `docs/roadmap.md` and `packages/report-data-provider/README.md`
 * say is not done, each said as a buyer would ask it. Report's own pages at
 * `/report/<language>/` speak to the searches for each topic; this one is the overview in
 * formancy.ai's room, and links each of them by its topic rather than repeating them.
 * If the module changes, this changes by hand.
 */

const REPOSITORY = 'formancy.ai-report'
const PAGES = 'https://formancy.ai/report/en/'

export const REPORT: Product = {
  page: 'report',
  name: 'Formancy Report',
  repository: REPOSITORY,
  title: 'Formancy Report: invoices, PDF and Word from your data',
  description:
    'Invoices with a Swiss QR-bill or EPC QR code, e-invoices, quotations and sales reports with charts, designed in your app and printed as PDF or Word.',
  h1: (
    <>
      The documents your business sends, <em>designed inside your application</em>
    </>
  ),
  lede:
    'Formancy Report is a report designer you host yourself, built natively for Angular and for React. A person lays out an invoice, a quotation or a ' +
    'sales report in your application; your application hands over the data and prints a PDF, or writes the same document as a Word file. Totals are ' +
    'exact, and a QR-bill and an EPC QR code are checked against SIX’s and the EPC’s rules before the PDF is made.',
  // The Studio, then the files it makes: a visitor already on a page about Report is sent to
  // its output next, and Report's own pages in four languages wait among the links.
  ctas: [
    { label: 'Try it in the Studio', href: 'https://formancy.ai/report/' },
    { label: 'Download the sample PDFs and Word files', href: github(REPOSITORY, 'samples/README.md') },
    { label: 'Its own pages, in English, German, French and Italian', href: PAGES },
    { label: 'Read the getting-started guide', href: github(REPOSITORY, 'docs/getting-started.md') },
    { label: 'Source on GitHub', href: github(REPOSITORY) },
  ],
  example: {
    figure: <ReportExample variant="page" />,
    real: {
      label: 'See the sample as the renderer printed it, Swiss QR Code and all',
      href: `${github(REPOSITORY, 'docs/starters.md')}#the-invoice-in-four-languages-and-the-euro-invoice-from-six-countries`,
    },
  },
  capabilities: [
    {
      label: 'Designers that live in your application',
      detail:
        'Your users lay out reports in a visual editor built natively for Angular 22 and for React 19, with exact undo and a keyboard path for ' +
        'every drag. Every expression is checked against your data’s fields before anything prints.',
    },
    {
      label: 'Exact PDFs, or a clear refusal',
      detail:
        'Totals are exact and rounded once, and values are formatted for the report’s language, in Node or in a browser. A report that cannot ' +
        'be drawn whole is refused with the reason, never cut short.',
    },
    {
      label: 'Word files your customers can keep editing',
      detail:
        'The same report comes out as a .docx, with repeating table headers, page numbers, pictures, QR codes, Word’s own charts and the ' +
        'QR-bill’s slip. What only a PDF can hold is refused, never silently dropped.',
    },
    {
      label: 'Swiss QR-bill and EPC QR code',
      detail:
        'The QR-bill follows SIX’s implementation guidelines 2.3 and 2.4, and the EPC QR code for a SEPA transfer follows EPC069-12. Account, ' +
        'reference and texts are checked before the PDF is made, and the amount is the invoice’s exact total.',
    },
    {
      label: 'E-invoices: Factur-X / ZUGFeRD and XRechnung 3.0',
      detail:
        'A Factur-X / ZUGFeRD PDF/A-3b carries its EN 16931 XML inside it; an XRechnung 3.0 is the XML your application sends, with a labelled ' +
        'PDF copy. In CI, Mustang, KoSIT’s validator and veraPDF judge what it writes.',
    },
    {
      label: 'Bar, line and pie charts',
      detail:
        'Charts are drawn from the report’s own rows, so each bar or slice is the total its table prints: Apache ECharts lays them out in the ' +
        'PDF, and the .docx gets Word’s own chart.',
    },
    {
      label: 'One template in several languages',
      detail:
        'A report’s words are written once per language, and each render prints in the one it names; a missing word refuses the render rather ' +
        'than printing a gap. Any report but an e-invoice can be drawn as PDF/A-2b for the archive.',
    },
    {
      label: 'Your data where it lives',
      detail:
        'Data comes from your application’s own JSON, from a formancy form’s submissions, each read against the form version that collected it, ' +
        'or from Formancy Data 0.1.0, best-effort. Images arrive by name and digest; nothing is fetched from an address.',
    },
  ],
  further: {
    lede: 'Formancy Report’s own pages, in English, German, French and Italian, say more about each, and its repository holds every sample.',
    links: [
      { label: 'Formancy Report, in four languages', href: PAGES },
      { label: 'The Swiss QR-bill', href: `${PAGES}swiss-qr-bill/` },
      { label: 'The EPC QR code', href: `${PAGES}epc-qr-code/` },
      { label: 'Reports for healthcare', href: `${PAGES}healthcare/` },
      { label: 'Every sample, as PDF and Word', href: github(REPOSITORY, 'samples/README.md') },
    ],
  },
  jobs: [
    'Invoices paid by a Swiss QR-bill, in German, French, Italian or English',
    'Euro invoices with an EPC QR code that a banking app reads for a SEPA transfer',
    'Factur-X / ZUGFeRD e-invoices, and XRechnung 3.0 for German public buyers',
    'Payment reminders with the QR-bill and what is overdue',
    'Quotations and order confirmations with several tables and a first page of their own',
    'A monthly sales report whose bar chart and pie print the totals its table prints',
    'Product data sheets in several languages from one template',
    'Service inspection and site visit reports from a formancy form’s submissions',
    'Referral letters, medical reports and invoices to patients as paginated PDFs',
    'Handing a customer the Word file of a document so they can go on editing it',
  ],
  whoFor:
    'Software vendors and in-house teams whose Angular or React application has to send documents: invoices paid by a Swiss QR-bill or an EPC QR ' +
    'code, e-invoices for German buyers, quotations, order confirmations, payment reminders, product data sheets, sales reports with charts, and ' +
    'healthcare letters. A person designs the template in your application. Your application hands over the data and prints it, on your server or ' +
    'in the browser.',
  fits: [
    'formancy — the spec, the engine, the renderers, the builder and the backend — is Apache-2.0 and free, and stays so. Formancy Report depends on ' +
      'its released packages at exact versions and copies none of their code.',
    'In your application, a person designs a report in Formancy Report’s builder for React or for Angular. Your application prints it with its PDF ' +
      'renderer, on your server or in the browser, or writes it with its Word writer, and reads formancy submissions through its forms package, each ' +
      'against the form version that collected it. Its getting-started guide, at the top of this page, names each package.',
    <>
      The forms those submissions come from are formancy’s: try the <a href={PLAYGROUND}>playground</a>, or, for an Angular application, the{' '}
      <a href="/angular-form-builder/">Angular form builder</a>.
    </>,
  ],
  release: {
    version: '0.3.0',
    date: '2026-11-23',
    preview: true,
    said: 'A developer preview. The report format is still version 0, a draft: a report written now is not promised to be read by a later release.',
  },
  notYet: [
    'PDF and Word only: no Excel, CSV or HTML output.',
    'Word files go out, not in: an existing Word template cannot be imported.',
    'QR codes only: no Code 128, EAN or DataMatrix barcodes.',
    'Latin, Greek and Cyrillic scripts only: Arabic, Hebrew, Chinese, Japanese and every other script are refused.',
    'It sends nothing: no e-mail and no Peppol.',
    'E-invoices are CII for Germany: no UBL, no check of France’s rules, and no FatturaPA for Italy.',
    'No print server or job queue: your application calls the renderer for each document, on your server or in the browser.',
    'No PDF viewer to embed: the Studio’s viewer is in no package, so your application shows the PDF in one of its own.',
    'A chart cannot yet be added from the designers’ palettes; it is added in the report’s definition.',
    'One list of detail rows per report, grouped by one field at most, and no running totals carried from page to page.',
    'Reading from Formancy Data is written against its 0.1.0 and is best-effort, not one consistent read.',
    'The designers’ own words are in English, German (Switzerland) and French (Switzerland).',
    'No lawyer has reviewed the licence, and there is no published price.',
  ],
  licence: {
    line: 'Formancy Report Source-Available Licence, Version 1, in force from 14 October 2026. Not reviewed by a lawyer.',
    rows: [
      ['Read the source and fork the repository', 'Free'],
      ['Evaluate, develop and test — including in companies', 'Free'],
      ['Run in production, internally or customer-facing', 'Paid licence'],
      ['Redistribute inside another software product', 'Separate commercial agreement'],
      ['Customer data, report templates and generated documents', 'Remain the customer’s'],
    ],
    howToBuy:
      'Production licences are requested from the Rightsholder at info@formancy.ai, as section 9 of the licence says. There is no published price. ' +
      'Running its Formancy Data provider in production also needs a Formancy Data production licence, for the Data client it depends on.',
  },
}
