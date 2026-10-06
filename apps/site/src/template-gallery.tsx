import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormSchema } from '@formancy/spec'
import { createFormEngine } from '@formancy/core'
import { ErrorSummary, FormancyForm, FormancyProvider } from '@formancy/react'
import catalog from '../../../templates/catalog.json'
import '@formancy/themes/paper.css'
import './template-gallery.css'

type Locale = 'en' | 'de' | 'fr'
type Entry = (typeof catalog.templates)[number]
const PLAYGROUND = import.meta.env.DEV ? 'http://localhost:4381/' : '/playground/'
const AREAS = [
  { id: 'hr', label: 'HR', mark: '01' },
  { id: 'sales', label: 'Sales', mark: '02' },
  { id: 'customer-service', label: 'Customer service', mark: '03' },
  { id: 'events', label: 'Events', mark: '04' },
  { id: 'operations', label: 'Operations', mark: '05' },
  { id: 'healthcare-administration', label: 'Healthcare administration', mark: '06' },
] as const

// The preview and download are two readings of the exact same file. Nothing
// serialises a preview back into a new document that might omit a rule.
const forms = import.meta.glob<FormSchema>('../../../templates/**/*.form.json', { eager: true, import: 'default' })
const downloads = import.meta.glob<string>('../../../templates/**/*.form.json', { eager: true, query: '?url', import: 'default' })
const templates = catalog.templates.map((entry) => {
  const path = `../../../templates/${entry.schema}`
  const schema = forms[path]
  const download = downloads[path]
  if (schema === undefined || download === undefined) throw new Error(`Missing template: ${entry.schema}`)
  return { ...entry, schemaDocument: schema, download }
})
type Template = (typeof templates)[number]
const editUrl = (entry: Entry, locale: Locale): string =>
  `${PLAYGROUND}?template=${encodeURIComponent(entry.id)}&locale=${locale}`

export function TemplateGallery() {
  const [area, setArea] = useState('all')
  const [query, setQuery] = useState('')
  const [locale, setLocale] = useState<Locale>('en')
  const [selected, setSelected] = useState<Template | null>(null)
  const search = query.trim().toLocaleLowerCase()
  const shown = templates.filter((entry) =>
    (area === 'all' || area === entry.area) &&
    [entry.title[locale], entry.description[locale], entry.title.en, entry.area]
      .some((text) => text.toLocaleLowerCase().includes(search)),
  )

  return (
    <div className="template-page">
      <a className="template-skip" href="#templates">Skip to templates</a>
      <header className="template-header">
        <a className="template-brand" href="/" aria-label="formancy.ai home"><span aria-hidden="true">f.</span> formancy.ai</a>
        <nav aria-label="Main navigation">
          <a href="/templates/" aria-current="page">Templates</a>
          <a href="/docs/start/templates/">Guide</a>
          <a href={PLAYGROUND}>Playground <span aria-hidden="true">↗</span></a>
        </nav>
      </header>
      <main>
        <section className="template-hero" aria-labelledby="gallery-title">
          <div>
            <p className="template-eyebrow">A starting point, already connected</p>
            <h1 id="gallery-title">A head start<br />for every <em>form.</em></h1>
            <p className="template-lede">From your next event to your next new hire. Pick a template, try its rules, and make it yours.</p>
            <div className="template-badges"><span>Angular + React</span><span>English · Deutsch · Français</span><span>Apache-2.0</span></div>
          </div>
          <aside className="template-hero-note" aria-label="Collection at a glance">
            <div className="template-sheet-art" aria-hidden="true"><span /><span /><i /><i /><b>✓</b></div>
            <strong>{templates.length} ready-to-use templates</strong>
            <p>Real forms. Working conditions.<br />Yours to download and adapt.</p>
          </aside>
        </section>
        <section id="templates" className="template-browser" aria-label="Browse templates">
          <div className="template-toolbar">
            <label className="template-search">Search templates<input type="search" value={query} placeholder="Try onboarding, feedback or registration" onChange={(event) => setQuery(event.target.value)} /></label>
            <label className="template-language">Template language<select value={locale} onChange={(event) => setLocale(event.target.value as Locale)}><option value="en">English</option><option value="de">Deutsch</option><option value="fr">Français</option></select></label>
          </div>
          <div className="template-filters" role="group" aria-label="Filter by area">
            <button type="button" aria-pressed={area === 'all'} onClick={() => setArea('all')}>All templates</button>
            {AREAS.map((item) => <button key={item.id} type="button" aria-pressed={area === item.id} onClick={() => setArea(item.id)}>{item.label}</button>)}
          </div>
          <p className="template-count" role="status">{shown.length} {shown.length === 1 ? 'template' : 'templates'} · Preview first. Customise when you’re ready.</p>
          <div className="template-grid">
            {shown.map((entry) => {
              const category = AREAS.find((item) => item.id === entry.area)!
              const title = entry.title[locale]
              return (
                <article className="template-card" data-area={entry.area} key={entry.id} aria-labelledby={`title-${entry.id}`}>
                  <div className="template-card-top"><span className="template-category-mark" aria-hidden="true">{category.mark}</span><span>{category.label}</span></div>
                  <h2 id={`title-${entry.id}`}>{title}</h2>
                  <p>{entry.description[locale]}</p>
                  <div className="template-card-meta"><span>3 languages</span><span>Conditional questions</span></div>
                  <div className="template-card-actions">
                    <button type="button" aria-label={`Preview ${title}`} onClick={() => setSelected(entry)}>Preview <span aria-hidden="true">↗</span></button>
                    <a href={editUrl(entry, locale)} aria-label={`Edit ${title} in playground`}>Use template <span aria-hidden="true">→</span></a>
                  </div>
                  <a className="template-download" href={entry.download} download={entry.schema.split('/').at(-1)} aria-label={`Download ${title} JSON`}>Download JSON</a>
                </article>
              )
            })}
          </div>
          {shown.length === 0 ? <div className="template-empty"><h2>No templates match your search.</h2><button type="button" onClick={() => { setQuery(''); setArea('all') }}>Clear filters</button></div> : null}
        </section>
        <section className="template-next"><div><p className="template-eyebrow">Your process, your form</p><h2>A useful beginning.<br />Room for your own rules.</h2></div><p>Every template includes editable questions, translations and conditional logic. Start with the closest fit, then adapt it in the visual builder or your code.<br /><a href="/docs/start/templates/">Read the template guide <span aria-hidden="true">→</span></a></p></section>
      </main>
      <footer className="template-footer"><span>formancy.ai · Open source, all the way.</span><a href="https://github.com/sharkysan/formancy.ai/tree/main/templates">Source &amp; examples</a><a href="/docs/">Documentation</a></footer>
      {selected === null ? null : <Preview entry={selected} locale={locale} onClose={() => setSelected(null)} />}
    </div>
  )
}

function Preview({ entry, locale, onClose }: { entry: Template; locale: Locale; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [status, setStatus] = useState('')
  const engine = useMemo(() => createFormEngine({
    schema: entry.schemaDocument, locale,
    capabilities: {
      now: () => Date.now(), random: () => Math.random(),
      today: () => {
        const now = new Date()
        return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-')
      },
    },
  }), [entry, locale])

  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])

  // Close while the dialog is still mounted so its native focus restoration
  // runs before React removes it from the document.
  const closePreview = () => {
    dialog.current?.close()
    onClose()
  }

  return (
    <dialog ref={dialog} className="template-preview" aria-labelledby="preview-title" onCancel={(event) => { event.preventDefault(); closePreview() }}>
      <div className="template-preview-header"><div><p className="template-eyebrow">Live preview</p><h2 id="preview-title">{entry.title[locale]}</h2></div><button type="button" autoFocus onClick={closePreview} aria-label="Close preview">✕</button></div>
      <p className="template-preview-note">Try the questions and conditions. Answers stay in this tab.</p>
      <form data-formancy-theme="paper" noValidate onSubmit={(event) => {
        event.preventDefault()
        const result = engine.submit()
        setStatus(result.ok ? 'The answers pass this template’s validation. Nothing was sent.' : 'Check the required fields and the errors shown below. Nothing was sent.')
      }}>
        <FormancyProvider engine={engine}><ErrorSummary /><FormancyForm layout="web" /></FormancyProvider>
        <div className="template-preview-controls"><button type="submit">Check answers</button><a href={editUrl(entry, locale)}>Edit in playground <span aria-hidden="true">↗</span></a></div>
        <p role="status">{status}</p>
      </form>
      <details className="template-adapt"><summary>What to adapt before use</summary><ul>{entry.adaptBeforeUse.map((note) => <li key={note}>{note}</li>)}</ul></details>
    </dialog>
  )
}
