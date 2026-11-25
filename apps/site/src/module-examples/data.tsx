import type { ReactElement } from 'react'
import type { Variant } from './variant.js'
import './examples.css'
import './data.css'

/**
 * Formancy Data's host page, drawn for formancy.ai (0242): the orders a person may read, a
 * page at a time on a view an administrator named, and one of them open as a form on white
 * paper, with the notes the studio's Generate step gives for that form.
 *
 * Drawn in HTML and CSS, not copied from the module's pictures, because this site asks no
 * other site for anything (0154) and serves no file another repository made. The values are
 * the module's own, read from formancy.ai-data on 2026-11-25: the six orders are the ones
 * `apps/host/scripts/pictures-workspace.mjs` inserts for the README's hero, their amounts as
 * a `numeric(18,4)` column prints them and their statuses as `ck_order_status` allows; the
 * open order, its fields written on create only disabled, and its Delivery tab are the
 * README's `host-record-tabs` and `host-workspace` pictures (`scripts/pictures/scenes.json`);
 * the generator's counts are its `studio-choose-generate` picture's. The customers but
 * Muster AG are invented by that capture script, which the caption says. Nothing else is
 * invented here, and nothing in it is a control: a field is a term and its value, so a
 * keyboard never stops on a drawing.
 *
 * `card` is the crop the landing page's section shows; `page` is the product page's.
 */

const ORDERS = [
  { id: '10418', customer: 'Café Entwurf GmbH', status: 'shipped', amount: '389.0000' },
  { id: '10419', customer: 'Beispiel Logistik KG', status: 'shipped', amount: '12800.0000' },
  { id: '10420', customer: 'Café Entwurf GmbH', status: 'placed', amount: '640.0000' },
  { id: '10421', customer: 'Beispiel Logistik KG', status: 'placed', amount: '4980.2000' },
  { id: '10422', customer: 'Muster AG', status: 'placed', amount: '1240.5000' },
  { id: '10423', customer: 'Vorlage & Partner GmbH', status: 'draft', amount: '157.3500' },
] as const

/** The order the record below is: Muster AG's, which the fixture holds. */
const OPEN = '10422'

/**
 * What the studio's Generate step says it chose for the form the host page draws, put in plain
 * words: its "9 fields.", "Read-only 5", "Inferred 11" and "Access 1", row-level security on
 * sales.customer.
 */
const NOTES = ['9 fields', '5 read-only', '11 choices inferred', 'Row-level security on sales.customer']

/** The card's three rows: the open order and the two before it, so the row the record below is open on is in the grid above it. */
const CARD_ROWS = ORDERS.slice(2, 5)

const CAPTIONS: Record<Variant, string> = {
  card:
    'Formancy Data’s host page: three orders on the view “Online orders”, and order 10422 open as a form on white paper. Drawn for this page after the ' +
    'module’s host example, over its sample sales data; the customers but Muster AG are invented.',
  page:
    'Formancy Data’s host page, as a clerk of one tenant sees it: the orders on the view “Online orders”, a page of six, and order 10422 open as a form, ' +
    'its fields written on create only disabled and its deliveries in a tab beside it, Express shipped on 18 November and Freight not yet. Beside it, ' +
    'what the studio’s generator chose for the form. Drawn for this page after Formancy Data’s host example, over its sample sales data; the ' +
    'customers but Muster AG are invented by the script that takes the module’s pictures. The live demo is the real thing.',
}

export function DataExample({ variant }: { variant: Variant }): ReactElement {
  const rows = variant === 'card' ? CARD_ROWS : ORDERS
  const page = variant === 'page'

  return (
    <figure className={`mx mx-data mx-${variant}`}>
      <div className="mx-stage">
        <div className="mx-panel">
          <p className="mx-panel-head">
            <b>Order</b>
            <span>
              View <span className="mx-view">Online orders</span>
            </span>
          </p>
          <table className="mx-grid">
            <caption className="visually-hidden">The orders on the view Online orders</caption>
            <thead>
              <tr>
                <th scope="col">Id</th>
                <th scope="col" className="mx-c-customer">
                  Customer
                </th>
                <th scope="col" className="mx-c-status">
                  Status
                </th>
                <th scope="col" className="mx-num">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((order) => (
                <tr key={order.id} className={order.id === OPEN ? 'mx-open' : undefined}>
                  <td className="mx-num-id">{order.id}</td>
                  <td>{order.customer}</td>
                  <td className="mx-c-status">
                    <span className="mx-status" data-status={order.status}>
                      {order.status}
                    </span>
                  </td>
                  <td className="mx-num">{order.amount}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {page && <p className="mx-panel-foot">Rows 1–6.</p>}
        </div>

        <div className="mx-lower">
          <div className="mx-paper mx-record">
            <p className="mx-tabs">
              <span className="mx-tab mx-tab-on">k1:{OPEN}</span>
              <span className="mx-tab">Delivery</span>
            </p>
            <dl className="mx-fields">
              <Field label="Customer" value="Muster AG" locked />
              <Field label="Status" value="placed" choice />
              <Field label="Amount" value="1240.5000" locked />
              {page && <Field label="Notes" value="Goods entrance" />}
            </dl>
          </div>

          {page && (
            <div className="mx-side">
              <div className="mx-panel">
                <p className="mx-panel-head">
                  <b>Delivery</b>
                </p>
                <table className="mx-grid">
                  <caption className="visually-hidden">The deliveries of order {OPEN}</caption>
                  <thead>
                    <tr>
                      <th scope="col">Carrier</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Express</td>
                    </tr>
                    <tr>
                      <td>Freight</td>
                    </tr>
                  </tbody>
                </table>
                <p className="mx-panel-foot">Delivery rows 1–2.</p>
              </div>
              <div className="mx-panel mx-notes">
                <p className="mx-panel-head">
                  <b>What the generator chose</b>
                  <span>Studio</span>
                </p>
                <ul aria-label="What the generator chose for the form">
                  {NOTES.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
      <figcaption>{CAPTIONS[variant]}</figcaption>
    </figure>
  )
}

/** A field of the open record: its label, and its value where a control would be, disabled or a choice as the host draws it. */
function Field({ label, value, locked = false, choice = false }: { label: string; value: string; locked?: boolean; choice?: boolean }): ReactElement {
  return (
    <div className="mx-field" data-locked={locked ? '' : undefined} data-choice={choice ? '' : undefined}>
      <dt>{label}</dt>
      <dd>
        {value}
        {locked && <span className="visually-hidden"> (disabled: written on create only)</span>}
      </dd>
    </div>
  )
}
