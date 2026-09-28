import type { ReactElement } from 'react'
import { createFormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { FormancyForm, FormancyProvider } from '@formancy/react'

/**
 * The card search engines and chat apps show when somebody shares the page.
 *
 * It is here, in the app, rather than being a PNG somebody once exported: the image it
 * produces has to say what the page says, and the last one outlived two rewrites of the
 * headline before anybody noticed it still read "One engine, in the browser and on the
 * server". A card built from the same fonts, the same colours and the same renderer
 * cannot drift from the page without the drift being visible here.
 *
 * **Reached only with `?og` in the URL**, so nothing about it is in the way of a
 * visitor. `docs/images/README.md` says how to turn it into `public/og.png`.
 *
 * Exactly 1200x630, which is what Open Graph asks for and what Twitter, Slack,
 * LinkedIn and iMessage all crop from.
 */

/** The same event form the hero preview shows, at the size a card can hold. */
function cardEngine() {
  const schema: FormSchema = {
    specVersion: '2',
    id: 'og-card',
    title: 'Registration',
    model: {
      fields: [
        { key: 'name', type: 'text', label: 'Your name', required: true },
        { key: 'email', type: 'text', label: 'Work email', required: true, format: 'email' },
        {
          key: 'pass',
          type: 'radio',
          label: 'Your pass',
          options: [
            { value: 'conference', label: 'Conference' },
            { value: 'workshops', label: 'Conference and workshops' },
          ],
        },
        { key: 'arriving', type: 'date', label: 'Arriving', earliest: '2027-05-03' },
        { key: 'total', type: 'number', label: 'Total, CHF' },
      ],
    },
    // The pass spans, the pairs do not: a full-width box for a one-word answer is what
    // makes a form look like a settings screen, and the card has one glance to make.
    layouts: [
      {
        name: 'web',
        nodes: [
          {
            kind: 'table',
            columns: 2,
            children: [
              { kind: 'field', path: 'name' },
              { kind: 'field', path: 'email' },
              { kind: 'field', path: 'pass', span: 'all' },
              { kind: 'field', path: 'arriving' },
              { kind: 'field', path: 'total' },
            ],
          },
        ],
      },
    ] as unknown as NonNullable<FormSchema['layouts']>,
    logic: {
      rules: [
        { target: 'total', kind: 'computed', cel: "pass == 'workshops' ? 790.0 : 490.0" },
        { target: 'total', kind: 'disabled', cel: 'true' },
      ],
    },
  }

  return createFormEngine({
    schema,
    capabilities: { now: () => 0, today: () => '2027-05-03', random: () => 0.5 },
    initialValue: {
      name: 'Mara Lindqvist',
      email: 'mara@example.ch',
      pass: 'conference',
      arriving: '2027-05-04',
    },
  })
}

/** One themed copy of the form, which is the claim the card makes in a picture. */
function Panel({ theme, tilt }: { theme: string; tilt: string }): ReactElement {
  return (
    <div className="og-panel" data-formancy-theme={theme} style={{ transform: tilt }}>
      <FormancyProvider engine={cardEngine()}>
        <FormancyForm layout="web" submitLabel="Register" onSubmit={() => undefined} />
      </FormancyProvider>
    </div>
  )
}

export function OgCard(): ReactElement {
  return (
    <div className="og-card" id="og-card">
      <div className="og-backdrop" aria-hidden="true" />
      <div className="og-words">
        <p className="og-brand">
          {/* The same F the favicon and the page header draw, taking the page's own
              accent tokens rather than hard-coding the two colours a third time: the
              violet stem is the browser, the teal arms are the server. A plain
              gradient square was here first and said nothing. */}
          <svg className="og-mark" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
            <rect width="64" height="64" rx="18" fill="var(--inset)" />
            <rect className="stem" x="14" y="14" width="12" height="36" rx="6" />
            <rect className="arm" x="30" y="14" width="20" height="12" rx="6" />
            <rect className="arm" x="30" y="30" width="14" height="12" rx="6" />
          </svg>
          formancy.ai
        </p>
        <h1>
          <span className="og-glow">Build the form.</span>
          <br />
          Ship your product.
        </h1>
        <p className="og-lede">
          A visual form builder for Angular and React. Conditional fields, validation and
          your own styling.
        </p>
        <p className="og-tags">
          <span>React</span>
          <span>Angular</span>
          <span>Self-hosted</span>
          <span>Apache-2.0</span>
        </p>
      </div>
      <div className="og-stack" aria-hidden="true">
        <Panel theme="dusk" tilt="rotate(6deg) translate(188px, -34px) scale(0.96)" />
        <Panel theme="pop" tilt="rotate(6deg)" />
      </div>
    </div>
  )
}
