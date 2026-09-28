import { useState } from 'react'
import type { ReactElement } from 'react'
import { createFormEngine } from '@formancy/core'
import type { FormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { FormancyForm, FormancyProvider } from '@formancy/react'

function previewEngine(company: boolean, previous?: FormEngine): FormEngine {
  const schema: FormSchema = {
    specVersion: '2',
    id: 'hero-registration',
    title: 'Make it your next great event.',
    model: { fields: [
      { key: 'heroName', type: 'text', label: 'Your name', required: true },
      { key: 'heroEmail', type: 'text', label: 'Work email', required: true, format: 'email' },
      ...(company ? [{ key: 'heroCompany', type: 'text' as const, label: 'Your company' }] : []),
    ] },
  }
  return createFormEngine({
    schema,
    initialValue: {
      heroName: previous?.getFieldSnapshot(['heroName']).value ?? '',
      heroEmail: previous?.getFieldSnapshot(['heroEmail']).value ?? '',
    },
  })
}

/** A small, real editing interaction. No network, fake saving or simulated submission. */
export function HeroStudio({ playground }: { playground: string }): ReactElement {
  const [company, setCompany] = useState(false)
  const [theme, setTheme] = useState<'paper' | 'dusk'>('paper')
  const [engine, setEngine] = useState(() => previewEngine(false))
  const [verdict, setVerdict] = useState('')

  const toggleCompany = (): void => {
    setEngine(previewEngine(!company, engine))
    setCompany(!company)
    setVerdict('')
  }

  return (
    <div className="hero-studio" aria-label="Interactive form preview" role="region">
      <div className="studio-orbit" aria-hidden="true" />
      <div className="studio-frame">
        <div className="studio-toolbar">
          <span className="studio-brand">f<span aria-hidden="true">.</span></span>
          <span>Event registration <small>Form preview</small></span>
          <span className="studio-live"><i aria-hidden="true" /> Live</span>
        </div>
        <div className="studio-workspace">
          <div className="studio-tools">
            <span className="studio-label">Make it yours</span>
            <p>One more question?</p>
            <button type="button" className="studio-add" aria-pressed={company} onClick={toggleCompany}>
              <span aria-hidden="true">{company ? '−' : '+'}</span>
              {company ? 'Remove company field' : 'Add company field'}
            </button>
            <div className="studio-theme" role="group" aria-label="Preview appearance">
              <span className="studio-label">Appearance</span>
              <button type="button" aria-pressed={theme === 'paper'} onClick={() => setTheme('paper')}>
                <span className="swatch light" aria-hidden="true" /> Light preview
              </button>
              <button type="button" aria-pressed={theme === 'dusk'} onClick={() => setTheme('dusk')}>
                <span className="swatch dark" aria-hidden="true" /> Dark preview
              </button>
            </div>
            <a href={playground} className="studio-editor-link">Open full editor <span aria-hidden="true">↗</span></a>
          </div>
          <div className="studio-canvas" data-formancy-theme={theme}>
            <span className="studio-event-tag">THE NEXT CHAPTER / 2027</span>
            <h2>Make it your next<br />great event.</h2>
            <FormancyProvider engine={engine}>
              <FormancyForm submitLabel="Check this form" onSubmit={(result) => setVerdict(result.ok ? 'Looks good. Nothing was sent.' : 'Complete the required fields to continue.')} />
            </FormancyProvider>
            <p className="studio-private">Try it here. Your answers stay in this tab.</p>
          </div>
        </div>
        <div className="studio-bottom">
          <span aria-live="polite">{verdict || (company ? 'Company field added' : '2 fields. Ready to make yours.')}</span>
          <span>Live React preview</span>
        </div>
      </div>
      <div className="studio-caption"><span aria-hidden="true">↳</span> This is a working form. Go ahead, change it.</div>
    </div>
  )
}
