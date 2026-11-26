import type { ReactElement } from 'react'
import { SwissQrCode } from './swiss-qr-code.js'
import type { Variant } from './variant.js'
import './examples.css'
import './report.css'

/**
 * Formancy Report's English invoice sample, drawn for formancy.ai (0242): an A4 page on white
 * paper with the Swiss QR-bill across its foot, and on the bill the sample's own Swiss QR Code
 * (0244).
 *
 * Read from formancy.ai-report on 2026-11-25: the firm, the customer, the number, the five
 * lines with their quantities and prices are `invoice-en` in
 * `packages/report-corpus/src/starters/invoice-words.ts`. Every amount is the rendered sample's
 * own, as `docs/images/samples.json` prints the text of `invoice-en`'s first page: each line's,
 * "Subtotal CHF 1'310.38", "VAT 8.1% CHF 106.14", "Total CHF 1'416.52", and the slip's
 * "CHF 1 416.52".
 *
 * **The code is the sample's.** Read from formancy.ai-report's `main` (81405cb) on 2026-11-26,
 * `PAYLOAD` is the text Report's runtime puts into `invoice-en`'s QR-bill: `resolveReport` over
 * the sample's report and data (`packages/report-corpus/src/starters/invoice.ts`), whose
 * `payload` in `packages/report-runtime/src/qr-bill.ts` writes each element of SIX's Table 8 on
 * its line. `swiss-qr-code.tsx` encodes it as Report's renderer does, so the code drawn here is
 * module for module the one in Report's published `docs/images/invoice-en.png`. The slip prints
 * what the code carries, as Report's does, under SIX's notice to separate it before paying in,
 * and `product-page.test.tsx` holds the words to the code. The firm and the customer are
 * invented, and the account is SIX's own example QR-IBAN, which no bank books.
 *
 * The two download labels above the page are the Studio's, drawn as part of the picture: they
 * are not links, and they are hidden from assistive technology, which the caption tells what
 * the Studio offers.
 */

/** The Swiss QR Code's text, each element of SIX's Table 8 on its line: the ultimate creditor's seven lines empty, no billing information. */
export const PAYLOAD = [
  'SPC',
  '0200',
  '1',
  'CH4431999123000889012',
  'S',
  'Formancy Building Services AG',
  'Gewerbestrasse',
  '14',
  '4053',
  'Basel',
  'CH',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '1416.52',
  'CHF',
  'S',
  'Riverside Coffee Roasters AG',
  'Rheingasse',
  '21',
  '4058',
  'Basel',
  'CH',
  'QRR',
  '000000000000000000202603184',
  'Invoice INV-2026-0318',
  'EPD',
].join('\n')

const LINES = [
  { description: 'Ventilation system service, base charge', quantity: '1.00', unit: 'flat rate', price: '480.00', amount: '480.00' },
  { description: 'F7 replacement filter for air handling unit', quantity: '6.00', unit: 'pcs', price: '38.50', amount: '231.00' },
  { description: 'Service technician, labour', quantity: '3.75', unit: 'h', price: '128.00', amount: '480.00' },
  { description: 'EPDM sealing tape', quantity: '12.50', unit: 'm', price: '4.35', amount: '54.38' },
  { description: 'Call-out charge, Basel area', quantity: '1.00', unit: 'flat rate', price: '65.00', amount: '65.00' },
] as const

/** A block of a part's information, as the slip prints it (IG 3.5.4, 3.6.2): its heading over its values. */
interface SlipBlock {
  readonly heading: string
  readonly values: readonly string[]
}

const ACCOUNT: SlipBlock = {
  heading: 'Account / Payable to',
  values: ['CH44 3199 9123 0008 8901 2', 'Formancy Building Services AG', 'Gewerbestrasse 14', '4053 Basel'],
}
const REFERENCE: SlipBlock = { heading: 'Reference', values: ['00 00000 00000 00000 02026 03184'] }
const ADDITIONAL_INFORMATION: SlipBlock = { heading: 'Additional information', values: ['Invoice INV-2026-0318'] }
const PAYABLE_BY: SlipBlock = { heading: 'Payable by', values: ['Riverside Coffee Roasters AG', 'Rheingasse 21', '4058 Basel'] }

/** What each part prints, in SIX's order: the additional information in the payment part alone. */
const RECEIPT = [ACCOUNT, REFERENCE, PAYABLE_BY] as const
const PAYMENT_PART = [ACCOUNT, REFERENCE, ADDITIONAL_INFORMATION, PAYABLE_BY] as const

const CAPTIONS: Record<Variant, string> = {
  card:
    "Formancy Report’s English invoice sample, INV-2026-0318: the top of the page, its Total CHF 1'416.52, and the QR-bill’s Receipt and Payment " +
    'part with the Swiss QR Code the sample carries. Drawn for this page after the sample, its code with the encoder Report uses; the firm and ' +
    'the customer are invented, and the account is SIX’s example QR-IBAN, which no bank books.',
  page:
    "Formancy Report’s English invoice sample, INV-2026-0318, on an A4 page: five lines, the subtotal, VAT at 8.1% and Total CHF 1'416.52, and " +
    'across the foot of the page the QR-bill, its Receipt and its Payment part each for CHF 1 416.52, the Payment part with the Swiss QR Code the ' +
    'sample carries and what the code says. The Studio offers it as a PDF and as a Word file. Drawn for this page after the sample, its code ' +
    'encoded from the sample’s payment data with the encoder Report uses; the firm and the customer are invented, and the account is SIX’s ' +
    'example QR-IBAN, which no bank books.',
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

          {page && <p className="mx-separate">Separate before paying in</p>}
          <div className="mx-slip">
            <div className="mx-receipt">
              <p className="mx-slip-title">Receipt</p>
              {page && <SlipInformation blocks={RECEIPT} />}
              <Amount />
              {page && <p className="mx-acceptance">Acceptance point</p>}
            </div>
            <div className="mx-payment">
              <p className="mx-slip-title">Payment part</p>
              <div className="mx-code">
                <SwissQrCode payload={PAYLOAD} />
              </div>
              <Amount />
              {page && <SlipInformation blocks={PAYMENT_PART} />}
            </div>
          </div>
        </div>
      </div>
      <figcaption>{CAPTIONS[variant]}</figcaption>
    </figure>
  )
}

/** A part's information: each block's heading over its values, one to a line. The card leaves it out, and keeps the code and the amount. */
function SlipInformation({ blocks }: { blocks: readonly SlipBlock[] }): ReactElement {
  return (
    <dl className="mx-slip-information">
      {blocks.map((block) => (
        <div key={block.heading}>
          <dt>{block.heading}</dt>
          <dd>
            {block.values.map((value) => (
              <span key={value}>{value}</span>
            ))}
          </dd>
        </div>
      ))}
    </dl>
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
