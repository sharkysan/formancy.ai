import { useState } from 'react'
import type { ReactElement } from 'react'
import { createFormEngine } from '@formancy/core'
import type { FormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { FormancyForm, FormancyProvider } from '@formancy/react'

/**
 * The four themes the packages ship, offered as the preview's appearance.
 *
 * Named by the theme rather than by "light" and "dark": there are two of each, and the
 * claim the page makes is that four stylesheets over the same markup do not look
 * related. A control offering two of them makes the weaker claim.
 *
 * `app.tsx` imports all four stylesheets, so switching is one attribute.
 */
const APPEARANCES = [
  { theme: 'paper', label: 'Paper', tone: 'light' },
  { theme: 'blueprint', label: 'Blueprint', tone: 'light' },
  { theme: 'dusk', label: 'Dusk', tone: 'dark' },
  { theme: 'pop', label: 'Pop', tone: 'bright' },
] as const

type Appearance = (typeof APPEARANCES)[number]['theme']

/**
 * What the engine is given: a form that looks like a product's, and three behaviours
 * a visitor can watch happen.
 *
 * **A two-column arrangement**, which is why there is a `layouts` entry at all: name
 * beside email and the date beside the total, so it reads as a real registration form
 * rather than a column of boxes. Below 40rem every theme collapses it to one column, so
 * the hero does not need a second schema for a phone.
 *
 * A field the layout does not place is invisible, so the company field has to be added
 * to BOTH when somebody asks for it — which is the rule the arrangement editor exists
 * to make obvious, and it applies here too.
 */
function previewEngine(company: boolean, previous?: FormEngine): FormEngine {
  const cell = (path: string, span?: 'all'): Record<string, unknown> => ({
    kind: 'field',
    path,
    ...(span === undefined ? {} : { span }),
  })

  const schema: FormSchema = {
    specVersion: '2',
    id: 'hero-registration',
    title: 'Make it your next great event.',
    model: {
      fields: [
        { key: 'heroName', type: 'text', label: 'Your name', required: true },
        { key: 'heroEmail', type: 'text', label: 'Work email', required: true, format: 'email' },
        ...(company ? [{ key: 'heroCompany', type: 'text' as const, label: 'Your company' }] : []),
        {
          key: 'heroTicket',
          type: 'radio',
          label: 'Your pass',
          options: [
            { value: 'conference', label: 'Conference' },
            { value: 'workshops', label: 'Conference and workshops' },
          ],
        },
        // Shown only for the second pass, by a rule the engine evaluates.
        {
          key: 'heroWorkshops',
          type: 'selectboxes',
          label: 'Workshops',
          options: [
            { value: 'engine', label: 'Building the engine' },
            { value: 'a11y', label: 'Accessible forms' },
            { value: 'hosting', label: 'Self-hosting' },
          ],
        },
        // A bound the format carries, so the control refuses a date before the doors
        // open rather than the server doing it later.
        { key: 'heroArriving', type: 'date', label: 'Arriving', earliest: '2027-05-03' },
        { key: 'heroTotal', type: 'number', label: 'Total, CHF' },
        { key: 'heroProgramme', type: 'checkbox', widget: 'toggle', label: 'Send me the programme' },
      ],
    },
    layouts: [
      {
        name: 'web',
        nodes: [
          {
            kind: 'table',
            columns: 2,
            children: [
              cell('heroName'),
              cell('heroEmail'),
              ...(company ? [cell('heroCompany', 'all')] : []),
              cell('heroTicket', 'all'),
              cell('heroWorkshops', 'all'),
              cell('heroArriving'),
              cell('heroTotal'),
              cell('heroProgramme', 'all'),
            ],
          },
        ],
      },
    ] as unknown as NonNullable<FormSchema['layouts']>,
    logic: {
      rules: [
        { target: 'heroWorkshops', kind: 'visible', cel: "heroTicket == 'workshops'" },
        // Doubles on both sides: a JSON number is a double and `double * int` has no
        // overload, which is the trap `expressionProblems` exists to catch at publish.
        { target: 'heroTotal', kind: 'computed', cel: "heroTicket == 'workshops' ? 790.0 : 490.0" },
        // Computed, so nobody types into it. The engine still owns the value.
        { target: 'heroTotal', kind: 'disabled', cel: 'true' },
      ],
    },
  }

  return createFormEngine({
    schema,
    // A form with logic rules needs these injected rather than reaching for the
    // ambient clock, so a server replaying the same submission gets the same answer.
    // Nothing here reads them — the rules are about the ticket — but the engine asks
    // for them up front rather than when a rule happens to use one.
    capabilities: {
      now: () => Date.now(),
      today: () => new Date().toISOString().slice(0, 10),
      random: () => Math.random(),
    },
    initialValue: {
      heroName: previous?.getFieldSnapshot(['heroName']).value ?? '',
      heroEmail: previous?.getFieldSnapshot(['heroEmail']).value ?? '',
      heroTicket: previous?.getFieldSnapshot(['heroTicket']).value ?? 'conference',
      heroWorkshops: previous?.getFieldSnapshot(['heroWorkshops']).value ?? [],
      heroArriving: previous?.getFieldSnapshot(['heroArriving']).value ?? '',
      heroProgramme: previous?.getFieldSnapshot(['heroProgramme']).value ?? null,
    },
  })
}

/** A small, real editing interaction. No network, fake saving or simulated submission. */
export function HeroStudio({ playground }: { playground: string }): ReactElement {
  const [company, setCompany] = useState(false)
  const [appearance, setAppearance] = useState<Appearance>('paper')
  const [engine, setEngine] = useState(() => previewEngine(false))
  const [verdict, setVerdict] = useState('')

  const toggleCompany = (): void => {
    setEngine(previewEngine(!company, engine))
    setCompany(!company)
    setVerdict('')
  }

  // Counted from the engine rather than written down, so adding a field to the schema
  // above cannot leave the caption claiming a number the form does not have.
  const fieldCount = engine.fieldPaths().length

  return (
    <div className="hero-studio" aria-label="Interactive form preview" role="region">
      <div className="studio-orbit" aria-hidden="true" />
      <div className="studio-frame">
        <div className="studio-toolbar">
          <span className="studio-brand">
            f<span aria-hidden="true">.</span>
          </span>
          <span>
            Event registration <small>Form preview</small>
          </span>
          <span className="studio-live">
            <i aria-hidden="true" /> Live
          </span>
        </div>
        <div className="studio-workspace">
          <div className="studio-tools">
            <span className="studio-label">Make it yours</span>
            <p>One more question?</p>
            <button
              type="button"
              className="studio-add"
              aria-pressed={company}
              onClick={toggleCompany}
            >
              <span aria-hidden="true">{company ? '−' : '+'}</span>
              {company ? 'Remove company field' : 'Add company field'}
            </button>
            <div className="studio-theme" role="group" aria-label="Preview appearance">
              <span className="studio-label">Appearance</span>
              <div className="studio-swatches">
                {APPEARANCES.map((option) => (
                  <button
                    key={option.theme}
                    type="button"
                    aria-pressed={appearance === option.theme}
                    onClick={() => setAppearance(option.theme)}
                  >
                    <span className={`swatch ${option.theme}`} aria-hidden="true" />
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <a href={playground} className="studio-editor-link">
              Open full editor <span aria-hidden="true">↗</span>
            </a>
          </div>
          <div className="studio-canvas" data-formancy-theme={appearance}>
            <span className="studio-event-tag">THE NEXT CHAPTER / 2027</span>
            <h2>
              Make it your next
              <br />
              great event.
            </h2>
            <FormancyProvider engine={engine}>
              <FormancyForm
                layout="web"
                submitLabel="Check this form"
                onSubmit={(result) =>
                  setVerdict(
                    result.ok
                      ? 'Looks good. Nothing was sent.'
                      : 'Complete the required fields to continue.',
                  )
                }
              />
            </FormancyProvider>
            <p className="studio-private">Try it here. Your answers stay in this tab.</p>
          </div>
        </div>
        <div className="studio-bottom">
          <span aria-live="polite">
            {verdict || `${String(fieldCount)} fields. The total and the workshops follow the pass.`}
          </span>
          <span>Live React preview</span>
        </div>
      </div>
      <div className="studio-caption">
        <span aria-hidden="true">↳</span> This is a working form. Go ahead, change it.
      </div>
    </div>
  )
}
