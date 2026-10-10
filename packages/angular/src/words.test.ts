import { Component, provideZonelessChangeDetection } from '@angular/core'
import type { Provider, Type } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/angular'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { createFormEngine } from '@formancy/core'
import type { FormEngine } from '@formancy/core'
import { FORM_WORDS, FORM_WORDS_DE, createFormText } from '@formancy/core/words'
import type { FormWordId, FormWordsByLocale } from '@formancy/core/words'
import type { FormSchema } from '@formancy/spec'
import {
  FormancyErrorSummary,
  FormancyForm,
  FormancyResumeNotice,
  provideFormancy,
  provideFormancyOptionsSources,
  provideFormancyScanner,
  provideFormancyUploader,
} from './index'
import type { OptionsSources, Scanner, StoredFile, Uploader } from './index'

/**
 * The renderer's own words, in the form's language — the cases the React binding is held
 * to, against the same catalogue, because the two draw one sentence for one state
 * ([0171](../../../docs/decisions/0171-the-renderers-words-are-the-forms-language.md)).
 *
 * They were English literals in the templates, so a German form asked its questions in
 * German around English buttons. Each case finds the control by its German name and
 * requires the English one gone. The German is read off the shipped catalogue, never
 * through the function the renderer calls, which could be wrong in the same way twice.
 */
afterEach(() => {
  TestBed.resetTestingModule()
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

const CLOCK = { now: () => 0, today: () => '2026-10-10', random: () => 0.5 }

const fill = (template: string, values: Record<string, string | number>): string =>
  template.replace(/\{(\w+)\}/g, (whole, name: string) => String(values[name] ?? whole))
const de = (id: FormWordId, values: Record<string, string | number> = {}): string => {
  const said = createFormText({ locale: 'de' })(id, values)
  const shipped = FORM_WORDS_DE[id]
  if (typeof shipped === 'string') expect(said).toBe(fill(shipped, values))
  expect(said).not.toBe(createFormText({ locale: '' })(id, values))
  return said
}
const en = (id: FormWordId, values: Record<string, string | number> = {}): string =>
  createFormText({ locale: '' })(id, values)

const document_ = (fields: unknown[], extra: Record<string, unknown> = {}): FormSchema =>
  ({ specVersion: '4', id: 'worte', title: 'Worte', model: { fields }, ...extra }) as unknown as FormSchema

async function mount(
  schema: FormSchema,
  {
    locale = 'de',
    words,
    providers = [],
    inputs = {},
    component = FormancyForm,
    initialValue,
  }: {
    locale?: string
    words?: FormWordsByLocale
    providers?: Provider[]
    inputs?: Record<string, unknown>
    component?: Type<unknown>
    initialValue?: Record<string, unknown>
  } = {},
): Promise<FormEngine> {
  const engine = createFormEngine({
    schema,
    locale,
    capabilities: CLOCK,
    ...(initialValue === undefined ? {} : { initialValue }),
  })
  const view = await render(component, {
    componentInputs: inputs,
    providers: [
      provideZonelessChangeDetection(),
      provideFormancy(engine, words === undefined ? {} : { words }),
      ...providers,
    ],
  })
  await view.fixture.whenStable()
  return engine
}

const settle = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

const status = (part: string): string =>
  document.querySelector(`[data-formancy-part="${part}"]`)?.textContent?.trim() ?? ''

const PAGED = document_([
  { key: 'one', type: 'page', label: 'Eins', fields: [{ key: 'name', type: 'text', label: 'Name' }] },
  { key: 'two', type: 'page', label: 'Zwei', fields: [{ key: 'city', type: 'text', label: 'Ort' }] },
])

describe('a German form', () => {
  test('says Next, Back and Submit in German, and names its steps', async () => {
    await mount(PAGED)

    expect(screen.getByRole('navigation', { name: de('form.progress') })).toBeTruthy()
    expect(screen.queryByRole('button', { name: en('form.next') })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: de('form.next') }))

    await waitFor(() => expect(screen.getByRole('button', { name: de('form.back') })).toBeTruthy())
    expect(screen.getByRole('button', { name: de('form.submit') })).toBeTruthy()
    expect(screen.queryByRole('button', { name: en('form.submit') })).toBeNull()
  })

  test('names a repeater’s buttons and its rows’ in German when the document does not', async () => {
    await mount(
      document_([
        { key: 'contacts', type: 'repeater', label: 'Kontakt', fields: [{ key: 'email', type: 'text', label: 'E-Mail' }] },
      ]),
    )

    fireEvent.click(screen.getByRole('button', { name: de('repeater.add', { label: 'Kontakt' }) }))
    fireEvent.click(screen.getByRole('button', { name: de('repeater.add', { label: 'Kontakt' }) }))

    const remove = de('repeater.remove', { label: 'Kontakt' })
    await waitFor(() =>
      expect(screen.getByRole('button', { name: de('repeater.removeRow', { remove, position: 1, count: 2 }) })).toBeTruthy(),
    )
    expect(
      screen.getByRole('button', { name: de('repeater.moveDown', { label: 'Kontakt', position: 1, count: 2 }) }),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', { name: de('repeater.moveUp', { label: 'Kontakt', position: 2, count: 2 }) }),
    ).toBeTruthy()
  })

  test('says a group is required in German', async () => {
    await mount(
      document_([
        { key: 'contactBy', type: 'radio', label: 'Kontaktweg', required: true, options: [{ value: 'post', label: 'Post' }] },
      ]),
    )

    const group = screen.getByRole('group', { name: 'Kontaktweg' })
    expect(within(group).getByText(de('form.required'))).toBeTruthy()
    expect(within(group).queryByText(en('form.required'))).toBeNull()
  })

  test('names a tab with no heading in German', async () => {
    await mount(
      document_([{ key: 'name', type: 'text', label: 'Name' }], {
        layouts: [
          { name: 'web', nodes: [{ kind: 'tabs', children: [{ kind: 'section', children: [{ kind: 'field', path: 'name' }] }] }] },
        ],
      }),
      { inputs: { layout: 'web' } },
    )

    expect(screen.getByRole('tab', { name: de('tabs.unnamed', { position: 1 }) })).toBeTruthy()
  })

  test('names a ranking’s buttons and lists in German', async () => {
    await mount(
      document_([
        {
          key: 'drinks',
          type: 'ranking',
          label: 'Getränke',
          options: [
            { value: 'tea', label: 'Tee' },
            { value: 'water', label: 'Wasser' },
          ],
        },
      ]),
    )

    fireEvent.click(screen.getByRole('button', { name: de('ranking.rank', { option: 'Tee' }) }))

    await waitFor(() =>
      expect(screen.getByRole('list', { name: de('ranking.order', { label: 'Getränke' }) })).toBeTruthy(),
    )
    expect(screen.getByRole('list', { name: de('ranking.pool', { label: 'Getränke' }) })).toBeTruthy()
    expect(screen.getByRole('button', { name: de('ranking.up', { option: 'Tee' }) })).toBeTruthy()
    expect(screen.getByRole('button', { name: de('ranking.down', { option: 'Tee' }) })).toBeTruthy()
    expect(screen.getByRole('button', { name: de('ranking.remove', { option: 'Tee' }) })).toBeTruthy()
  })

  test('names a tag picker’s chosen list and its remove buttons in German', async () => {
    await mount(
      document_([
        { key: 'tags', type: 'selectboxes', widget: 'tagpicker', label: 'Themen', options: [{ value: 'a', label: 'Alpha' }] },
      ]),
    )

    fireEvent.input(screen.getByRole('combobox', { name: 'Themen' }), { target: { value: 'Al' } })
    await waitFor(() =>
      expect(screen.getByRole('listbox', { name: de('options.suggestions', { label: 'Themen' }) })).toBeTruthy(),
    )
    fireEvent.click(screen.getByRole('option', { name: 'Alpha' }))

    await waitFor(() =>
      expect(screen.getByRole('list', { name: de('tagpicker.chosen', { label: 'Themen' }) })).toBeTruthy(),
    )
    expect(screen.getByRole('button', { name: de('tagpicker.remove', { option: 'Alpha' }) })).toBeTruthy()
  })

  test('names the formatting toolbar and its buttons in German, and asks for a link in it', async () => {
    const asked = vi.fn(() => null)
    vi.stubGlobal('prompt', asked)
    await mount(document_([{ key: 'notes', type: 'richtext', label: 'Notizen' }]))

    const toolbar = screen.getByRole('toolbar', { name: de('richtext.toolbar', { label: 'Notizen' }) })
    for (const id of ['richtext.strong', 'richtext.emphasis', 'richtext.bulletList', 'richtext.orderedList'] as const) {
      expect(within(toolbar).getByRole('button', { name: de(id) })).toBeTruthy()
    }
    fireEvent.click(within(toolbar).getAllByRole('button')[2]!)
    expect(asked).toHaveBeenCalledWith(de('richtext.linkAddress'))
  })

  test('names a signature’s typed box and its clear button in German', async () => {
    await mount(document_([{ key: 'sign', type: 'signature', label: 'Unterschrift' }]))

    expect(screen.getByRole('textbox', { name: de('signature.typed') })).toBeTruthy()
    expect(screen.getByRole('button', { name: de('signature.clear') })).toBeTruthy()
  })
})

@Component({
  selector: 'formancy-test-words-summary',
  imports: [FormancyErrorSummary, FormancyForm],
  template: `<formancy-error-summary /><formancy-form />`,
})
class SummaryHost {}

describe('the error summary in a German form', () => {
  test('counts the problems in German, one and several', async () => {
    const fields = [
      { key: 'name', type: 'text', label: 'Name', required: true },
      { key: 'city', type: 'text', label: 'Ort', required: true },
    ]
    await mount(document_(fields), { component: SummaryHost })

    fireEvent.click(screen.getByRole('button', { name: de('form.submit') }))

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: de('errors.heading', { count: 2 }) })).toBeTruthy(),
    )
    // The codes are the engine's, and stay codes; the sentence around them is the form's.
    const entry = createFormText({ locale: 'de' })
    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual([
      entry('errors.entry', { label: 'Name', codes: 'required' }),
      entry('errors.entry', { label: 'Ort', codes: 'required' }),
    ])
    TestBed.resetTestingModule()
    document.body.innerHTML = ''

    await mount(document_(fields.slice(0, 1)), { component: SummaryHost })
    fireEvent.click(screen.getByRole('button', { name: de('form.submit') }))
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: de('errors.heading', { count: 1 }) })).toBeTruthy(),
    )
  })
})

describe('every live region in a German form', () => {
  const pdf = (name: string): File => new File(['x'], name, { type: 'application/pdf' })
  const stored = (name: string): StoredFile => ({
    id: `id-${name}`,
    name,
    size: 1,
    contentType: 'application/pdf',
    storageKey: `k-${name}`,
  })

  test('says what happens to each file in German', async () => {
    const settlers: Array<{ reject: (error: unknown) => void }> = []
    const uploader: Uploader = () => new Promise<StoredFile>((_, reject) => settlers.push({ reject }))
    await mount(document_([{ key: 'evidence', type: 'file', label: 'Belege' }]), {
      providers: [provideFormancyUploader(uploader)],
    })

    fireEvent.change(screen.getByLabelText('Belege'), { target: { files: [pdf('a.pdf')] } })
    await screen.findByRole('progressbar', { name: de('file.uploading', { name: 'a.pdf' }) })
    expect(status('file-status')).toBe(de('file.status.uploading', { name: 'a.pdf' }))
    expect(screen.getByRole('button', { name: de('file.cancel', { name: 'a.pdf' }) })).toBeTruthy()

    settlers[0]!.reject(new Error('zu gross'))
    await waitFor(() =>
      expect(status('file-status')).toBe(de('file.status.failed', { name: 'a.pdf', reason: 'zu gross' })),
    )
    expect(screen.getByText(de('file.notAttached', { reason: 'zu gross' }))).toBeTruthy()
    expect(screen.getByRole('button', { name: de('file.retry', { name: 'a.pdf' }) })).toBeTruthy()
    expect(screen.getByRole('button', { name: de('file.dismiss', { name: 'a.pdf' }) })).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Belege'), { target: { files: [pdf('b.pdf')] } })
    await waitFor(() => expect(settlers).toHaveLength(2))
    settlers[1]!.reject(new Error('nein'))
    const text = createFormText({ locale: 'de' })
    await waitFor(() =>
      expect(status('file-status')).toBe(
        text('file.status.failedSeveral', { count: 2, names: text.list(['a.pdf', 'b.pdf']) }),
      ),
    )
    expect(status('file-status')).toContain('a.pdf und b.pdf')
  })

  test('names a stored file’s buttons in German, and the way back from removing one', async () => {
    await mount(document_([{ key: 'evidence', type: 'file', label: 'Belege' }]), {
      providers: [provideFormancyUploader(() => new Promise(() => undefined))],
      initialValue: { evidence: [stored('a.pdf'), stored('b.pdf')] },
    })

    expect(screen.getByRole('button', { name: de('file.down', { name: 'a.pdf', position: 1, count: 2 }) })).toBeTruthy()
    expect(screen.getByRole('button', { name: de('file.up', { name: 'b.pdf', position: 2, count: 2 }) })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: de('file.remove', { name: 'a.pdf' }) }))
    await waitFor(() => expect(screen.getByRole('button', { name: de('file.undo', { name: 'a.pdf' }) })).toBeTruthy())
  })

  test('says a file field has nowhere to put a file, in German', async () => {
    await mount(document_([{ key: 'evidence', type: 'file', label: 'Belege' }]))

    expect(screen.getByText(de('file.unavailable'))).toBeTruthy()
  })

  test('says what a search is doing in German: too short, searching, capped, failed', async () => {
    let answer: (rows: Array<{ value: string; label: string }>) => void = () => undefined
    let fail: (error: unknown) => void = () => undefined
    const sources: OptionsSources = {
      orte: {
        debounceMs: 0,
        minQueryLength: 2,
        maxRows: 1,
        resolve: () =>
          new Promise((resolve, reject) => {
            answer = resolve
            fail = reject
          }),
      },
    }
    await mount(
      document_([{ key: 'ort', type: 'select', widget: 'typeahead', label: 'Ort', optionsSource: 'orte' }]),
      { providers: [provideFormancyOptionsSources(sources)] },
    )
    const box = screen.getByRole('combobox', { name: 'Ort' })

    fireEvent.input(box, { target: { value: 'Z' } })
    await waitFor(() => expect(status('typeahead-status')).toBe(de('options.tooShort', { count: 2 })))
    // Collapsed while there is nothing to offer, and named all the same.
    expect(screen.getByRole('listbox', { hidden: true }).getAttribute('aria-label')).toBe(
      de('options.suggestions', { label: 'Ort' }),
    )

    fireEvent.input(box, { target: { value: 'Zü' } })
    await waitFor(() => expect(status('typeahead-status')).toBe(de('options.searching')))
    answer([
      { value: 'ZH', label: 'Zürich' },
      { value: 'ZG', label: 'Zug' },
    ])
    await waitFor(() => expect(status('typeahead-status')).toBe(de('options.capped', { shown: 1, total: 2 })))

    fireEvent.input(box, { target: { value: 'Zug' } })
    await waitFor(() => expect(status('typeahead-status')).toBe(de('options.searching')))
    fail(new Error('down'))
    await waitFor(() => expect(status('typeahead-status')).toBe(de('options.failed')))
  })

  test('says nothing matched in German', async () => {
    await mount(
      document_([
        { key: 'ort', type: 'select', widget: 'typeahead', label: 'Ort', options: [{ value: 'ZH', label: 'Zürich' }] },
      ]),
    )

    fireEvent.input(screen.getByRole('combobox', { name: 'Ort' }), { target: { value: 'Bern' } })

    await waitFor(() => expect(status('typeahead-status')).toBe(de('options.noMatch')))
  })

  test('says a list from nowhere has no source, in German, and a plain select’s region too', async () => {
    await mount(document_([{ key: 'ort', type: 'select', label: 'Ort', optionsSource: 'orte' }]))
    expect(screen.getByText(de('options.unavailable', { source: 'orte' }))).toBeTruthy()
    TestBed.resetTestingModule()
    document.body.innerHTML = ''

    const sources: OptionsSources = { orte: { debounceMs: 0, resolve: () => Promise.reject(new Error('down')) } }
    await mount(document_([{ key: 'ort', type: 'select', label: 'Ort', optionsSource: 'orte' }]), {
      providers: [provideFormancyOptionsSources(sources)],
    })
    await waitFor(() => expect(status('select-status')).toBe(de('options.failed')))
  })

  test('says a scan is running, and why it did not work, in German', async () => {
    let finish: (text: unknown) => void = () => undefined
    let refuse: (error: unknown) => void = () => undefined
    // A host written in plain JavaScript can resolve with anything, a number included.
    const scan: Scanner = () =>
      new Promise<string | null>((resolve, reject) => {
        finish = resolve as (text: unknown) => void
        refuse = reject
      })
    await mount(document_([{ key: 'code', type: 'text', widget: 'scanner', label: 'Code' }]), {
      providers: [provideFormancyScanner(scan)],
    })
    const button = screen.getByRole('button', { name: `${de('scanner.scan')} Code` })

    fireEvent.click(button)
    await waitFor(() => expect(status('scanner-status')).toBe(de('scanner.scanning')))
    finish(42)
    await waitFor(() => expect(status('scanner-status')).toBe(de('scanner.noText')))

    fireEvent.click(button)
    await settle()
    refuse(new Error('Kamera verweigert'))
    await waitFor(() =>
      expect(status('scanner-status')).toBe(de('scanner.failed', { reason: 'Kamera verweigert' })),
    )
  })
})

describe('a draft that came back changed, told in German', () => {
  test('inside the form’s providers, in the form’s language', async () => {
    await mount(PAGED, {
      component: FormancyResumeNotice,
      inputs: { migration: { severity: 'lossy', changes: [{ kind: 'removed', path: 'fax' }] } },
    })

    expect(screen.getByRole('region', { name: de('resume.heading') })).toBeTruthy()
    expect(screen.getByText(createFormText({ locale: 'de' })('resume.setAside', { count: 1 }))).toBeTruthy()
    TestBed.resetTestingModule()
    document.body.innerHTML = ''

    await mount(PAGED, { component: FormancyResumeNotice, inputs: { migration: { severity: 'breaking', changes: [] } } })
    expect(screen.getByText(de('resume.breaking.cannotSubmit'))).toBeTruthy()
  })

  test('and in English outside them, which have no form to take a language from', async () => {
    const view = await render(FormancyResumeNotice, {
      componentInputs: { migration: { severity: 'breaking', changes: [] } },
      providers: [provideZonelessChangeDetection()],
    })
    await view.fixture.whenStable()

    expect(screen.getByRole('region', { name: en('resume.heading') })).toBeTruthy()
  })
})

describe('whose words win', () => {
  test('the author’s: a submit label and a repeater’s own button words', async () => {
    await mount(
      document_([
        { key: 'items', type: 'repeater', label: 'Posten', addLabel: 'Noch einer', fields: [{ key: 'x', type: 'text', label: 'X' }] },
      ]),
      { inputs: { submitLabel: 'Bestellen' } },
    )

    expect(screen.getByRole('button', { name: 'Bestellen' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Noch einer' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: de('form.submit') })).toBeNull()
  })

  test('a host’s, for a language it adds and a word it changes', async () => {
    const words = { it: { 'form.next': 'Avanti' }, de: { 'form.submit': 'Senden' } }
    await mount(PAGED, { locale: 'it', words })
    expect(screen.getByRole('button', { name: 'Avanti' })).toBeTruthy()
    expect(screen.getByRole('navigation', { name: FORM_WORDS['form.progress'] })).toBeTruthy()
    TestBed.resetTestingModule()
    document.body.innerHTML = ''

    await mount(document_([{ key: 'name', type: 'text', label: 'Name' }]), { locale: 'de', words })
    expect(screen.getByRole('button', { name: 'Senden' })).toBeTruthy()
  })

  test('never the browser’s: the engine’s locale is the form’s language', async () => {
    vi.stubGlobal('navigator', { language: 'de-DE', languages: ['de-DE'] })
    await mount(document_([{ key: 'name', type: 'text', label: 'Name' }]), { locale: '' })

    expect(screen.getByRole('button', { name: en('form.submit') })).toBeTruthy()
  })
})
