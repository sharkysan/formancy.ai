import type { ReactElement } from 'react'
import type { Variant } from './variant.js'
import './examples.css'
import './report.css'

/**
 * Formancy Report's English invoice sample, drawn for formancy.ai (0242): an A4 page on white
 * paper with the Swiss QR-bill across its foot.
 *
 * Read from formancy.ai-report on 2026-11-25: the firm, the customer, the number, the five
 * lines with their quantities and prices are `invoice-en` in
 * `packages/report-corpus/src/starters/invoice-words.ts`. Every amount is the rendered sample's
 * own, as `docs/images/samples.json` prints the text of `invoice-en`'s first page: each line's,
 * "Subtotal CHF 1'310.38", "VAT 8.1% CHF 106.14", "Total CHF 1'416.52", and the slip's
 * "CHF 1 416.52". The account is SIX's own example QR-IBAN, which no bank books.
 *
 * **The Swiss QR Code is not drawn.** Where the renderer puts it there is a square with only
 * the Swiss cross at its centre and no modules, and words saying what goes there, so nothing
 * on this site can be scanned or taken for a code someone could pay. The two download labels
 * above the page are the Studio's, drawn as part of the picture: they are not links, and they
 * are hidden from assistive technology, which the caption tells what the Studio offers.
 */

const LINES = [
  { description: 'Ventilation system service, base charge', quantity: '1.00', unit: 'flat rate', price: '480.00', amount: '480.00' },
  { description: 'F7 replacement filter for air handling unit', quantity: '6.00', unit: 'pcs', price: '38.50', amount: '231.00' },
  { description: 'Service technician, labour', quantity: '3.75', unit: 'h', price: '128.00', amount: '480.00' },
  { description: 'EPDM sealing tape', quantity: '12.50', unit: 'm', price: '4.35', amount: '54.38' },
  { description: 'Call-out charge, Basel area', quantity: '1.00', unit: 'flat rate', price: '65.00', amount: '65.00' },
] as const

const CREDITOR = ['CH44 3199 9123 0008 8901 2', 'Formancy Building Services AG', 'Gewerbestrasse 14', '4053 Basel'] as const

const CAPTIONS: Record<Variant, string> = {
  card:
    "Formancy Report’s English invoice sample, INV-2026-0318: the top of the page, its Total CHF 1'416.52, and the QR-bill’s Receipt and Payment " +
    'part. Drawn for this page after the sample; the square stands where the renderer draws the Swiss QR Code, so nothing here can be scanned.',
  page:
    "Formancy Report’s English invoice sample, INV-2026-0318, on an A4 page: five lines, the subtotal, VAT at 8.1% and Total CHF 1'416.52, and " +
    'across the foot of the page the QR-bill, its Receipt and its Payment part each for CHF 1 416.52. The Studio offers it as ' +
    'a PDF and as a Word file. Drawn for this page after the sample, whose firm and customer are invented and whose account is SIX’s example QR-IBAN, ' +
    'which no bank books; where the renderer draws the Swiss QR Code this drawing leaves a square with only the Swiss cross, so nothing here can be scanned.',
}

export function ReportExample({ variant }: { variant: Variant }): ReactElement {
  const page = variant === 'page'

  return (
    <figure className={`mx mx-report mx-${variant}`}>
      <div className="mx-stage">
        {page && (
          <p className="mx-downloads" aria-hidden="true">
            <span>Download PDF</span>
            <span>Download Word</span>
          </p>
        )}
        <div className="mx-paper mx-a4">
          <div className="mx-a4-body">
            <p className="mx-sender">Formancy Building Services AG · Gewerbestrasse 14 · 4053 Basel</p>
            {page && (
              <p className="mx-address">
                Riverside Coffee Roasters AG
                <br />
                Rheingasse 21
                <br />
                4058 Basel
              </p>
            )}
            <p className="mx-doc-title">Invoice</p>
            <p className="mx-doc-meta">Number: INV-2026-0318</p>
            {page && (
              <table className="mx-lines">
                <caption className="visually-hidden">The invoice’s lines</caption>
                <thead>
                  <tr>
                    <th scope="col">Description</th>
                    <th scope="col" className="mx-num">
                      Quantity
                    </th>
                    <th scope="col" className="mx-c-unit">
                      Unit
                    </th>
                    <th scope="col" className="mx-num mx-c-price">
                      Price
                    </th>
                    <th scope="col" className="mx-num">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {LINES.map((line) => (
                    <tr key={line.description}>
                      <td>{line.description}</td>
                      <td className="mx-num">{line.quantity}</td>
                      <td className="mx-c-unit">{line.unit}</td>
                      <td className="mx-num mx-c-price">{line.price}</td>
                      <td className="mx-num">{line.amount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <dl className="mx-sums">
              {page && (
                <>
                  <div>
                    <dt>Subtotal</dt>
                    <dd>CHF 1&apos;310.38</dd>
                  </div>
                  <div>
                    <dt>VAT 8.1%</dt>
                    <dd>CHF 106.14</dd>
                  </div>
                </>
              )}
              <div className="mx-total">
                <dt>Total</dt>
                <dd>CHF 1&apos;416.52</dd>
              </div>
            </dl>
          </div>

          <div className="mx-slip">
            <div className="mx-receipt">
              <p className="mx-slip-title">Receipt</p>
              <p className="mx-slip-label">Account / Payable to</p>
              <p className="mx-slip-lines">
                {CREDITOR.map((line) => (
                  <span key={line}>{line}</span>
                ))}
              </p>
              <Amount />
            </div>
            <div className="mx-payment">
              <p className="mx-slip-title">Payment part</p>
              <div className="mx-code">
                <span className="mx-code-square" aria-hidden="true">
                  <span className="mx-cross" />
                </span>
                <span className="mx-code-note">The renderer draws the Swiss QR Code here</span>
              </div>
              <div className="mx-payment-text">
                <p className="mx-slip-label">Account / Payable to</p>
                <p className="mx-slip-lines">
                  {CREDITOR.map((line) => (
                    <span key={line}>{line}</span>
                  ))}
                </p>
              </div>
              <Amount />
            </div>
          </div>
        </div>
      </div>
      <figcaption>{CAPTIONS[variant]}</figcaption>
    </figure>
  )
}

/** The slip's currency and amount, as each of its two parts prints them. */
function Amount(): ReactElement {
  return (
    <dl className="mx-slip-amount">
      <div>
        <dt>Currency</dt>
        <dd>CHF</dd>
      </div>
      <div>
        <dt>Amount</dt>
        <dd>1 416.52</dd>
      </div>
    </dl>
  )
}
