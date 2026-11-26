import type { ReactElement } from 'react'
import { DataExample } from './module-examples/data.js'
import { HealthExample } from './module-examples/health.js'
import { ReportExample } from './module-examples/report.js'
import { HL7_MARK, READ_ON, TERMS, longDate } from './products/product.js'
import './modules.css'

/**
 * The paid modules' section of the landing page (0242): Formancy Data, Formancy Report and
 * Formancy Health, each with its promise, what it covers, a sketch of what it makes, and a
 * way to its product page and to its own demonstration.
 *
 * A file of its own because `app.tsx` is at its ceiling in `size.test.ts`, as the licence
 * section was; the section wrapper stays in the page, which owns the journey. It sits after
 * the self-hosting section and just before the licence, so the engine has told its whole
 * story first. The lede is one line, because the licence section right below it says the
 * terms in full and where to ask; said twice in a row, the paragraph read as a repeat.
 *
 * **Each card is one item, and its terms are in it**, beside both of its links, as the
 * licence section's items are (0179, 0241): a link is often reached alone, by tab or from
 * a list of links, and the eyebrow and the lede above the cards do not count as its terms.
 * `site.test.tsx` holds every link to a module on the page to that. Formancy Health's card
 * names HL7's marks, so it carries HL7's sentence in its own item.
 *
 * **The words come before the sketch in each card**, and the stylesheet draws the sketch on
 * top: somebody moving by headings lands on a module's name and then reads its sketch, rather
 * than reading one module's sketch under the previous module's heading.
 *
 * What each card says was read from the module's repository on `READ_ON`; nothing here
 * checks it again, so it is dated on the page.
 */

const CARDS = [
  {
    id: 'data',
    name: 'Formancy Data',
    subheading: 'Forms over the database you already run',
    promise: 'Your existing PostgreSQL or SQL Server database, as forms in your own React or Angular application, under your own rules.',
    chips: ['PostgreSQL · SQL Server', 'Your rules on every request', 'Lookups and child records', 'CSV, bulk changes, actions'],
    example: <DataExample variant="card" />,
    links: [
      { label: 'What Formancy Data does', href: '/products/data/' },
      { label: 'Try the live demo', href: 'https://formancy.ai/data/demo/' },
    ],
  },
  {
    id: 'report',
    name: 'Formancy Report',
    subheading: 'The documents your business sends',
    promise: 'Invoices, quotations and sales reports, designed inside your Angular or React application and printed from your own data as PDF or Word.',
    chips: ['PDF and Word', 'Swiss QR-bill · EPC QR code', 'Factur-X · XRechnung', 'Charts'],
    example: <ReportExample variant="card" />,
    links: [
      { label: 'What Formancy Report does', href: '/products/report/' },
      { label: 'Try it in the Studio', href: 'https://formancy.ai/report/' },
    ],
  },
  {
    id: 'health',
    name: 'Formancy Health',
    subheading: 'Records healthcare can exchange',
    // What Health's README says it does: SDC for the form and its answers, a base R4 document
    // Bundle for a PDF, and CH ORF on CH Core for a Swiss referral. A PDF is refused in a CH
    // ORF document, so the profiles are said of the referral alone.
    promise:
      'Your formancy forms and a person’s answers as HL7® FHIR® R4 resources, your PDFs in a FHIR document Bundle, and Swiss referrals as CH ORF on CH Core.',
    chips: ['HL7® FHIR® R4', 'SDC Questionnaire', 'CH Core · CH ORF', 'PDF in a DocumentReference'],
    example: <HealthExample variant="card" />,
    links: [
      { label: 'What Formancy Health does', href: '/products/health/' },
      { label: 'Try the demo', href: 'https://formancy.ai/health/' },
    ],
    mark: HL7_MARK,
  },
] as const

export function Modules(): ReactElement {
  return (
    <>
      <div className="modules-head">
        <p className="eyebrow">Modules built on formancy · not free</p>
        <h2>Forms over your database. Documents from your data. Records for healthcare.</h2>
        <p className="lede">
          Built on formancy and sold beside it, each under a source-available licence of its own: free to try and build with, paid in production.
        </p>
      </div>

      {/* The room the cards are laid out by: a size container, since what they need is
          the width the section leaves them beside the running submission, not the screen's. */}
      <div className="modules-room">
        <ul className="modules-cards" aria-label="The paid modules">
          {CARDS.map((card) => (
            <li key={card.id} className="module-card" data-module={card.id}>
              <div className="module-card-body">
                <h3>{card.name}</h3>
                <p className="module-card-sub">{card.subheading}</p>
                <p className="module-card-terms">{TERMS}</p>
                <p className="module-card-promise">{card.promise}</p>
                <ul className="module-chips" aria-label={`What ${card.name} covers`}>
                  {card.chips.map((chip) => (
                    <li key={chip}>{chip}</li>
                  ))}
                </ul>
                <p className="module-card-links">
                  {card.links.map((link) => (
                    <a key={link.href} href={link.href}>
                      {link.label}
                    </a>
                  ))}
                </p>
                {'mark' in card && <p className="module-card-mark">{card.mark}</p>}
              </div>
              {card.example}
            </li>
          ))}
        </ul>
      </div>

      <p className="modules-foot">
        Each module as of <time dateTime={READ_ON}>{longDate(READ_ON)}</time>.
      </p>
    </>
  )
}
