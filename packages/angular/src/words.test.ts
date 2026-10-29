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
  ({ specVersion: '5', id: 'worte', title: 'Worte', model: { fields }, ...extra }) as unknown as FormSchema

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

const part = (name: string): Element | null => document.querySelector(`[data-formancy-part="${name}"]`)
const status = (name: string): string => part(name)?.textContent?.trim() ?? ''

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

  // Said where the add button was once the repeater holds its maximum (0220): the renderer's word,
  // since the document has none for it.
  test('says a full repeater is full in German', async () => {
    await mount(
      document_([
        {
          key: 'contacts',
          type: 'repeater',
          label: 'Kontakt',
          maxItems: 1,
          fields: [{ key: 'email', type: 'text', label: 'E-Mail' }],
        },
      ]),
    )

    fireEvent.click(screen.getByRole('button', { name: de('repeater.add', { label: 'Kontakt' }) }))
    await waitFor(() => expect(screen.getByRole('status').textContent?.trim()).toBe(de('repeater.full', { max: 1 })))
    expect(screen.getByRole('status').textContent?.trim()).not.toBe(en('repeater.full', { max: 1 }))
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

    expect(screen.getByRole('textbox', { name: de('signature.typed', { label: 'Unterschrift' }) })).toBeTruthy()
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
    // The error said in German too, not left as the engine's code (0191).
    const entry = createFormText({ locale: 'de' })
    const problems = entry('error.required')
    expect(problems).toBe('Diese Frage braucht eine Antwort.')
    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual([
      entry('errors.entry', { label: 'Name', problems }),
      entry('errors.entry', { label: 'Ort', problems }),
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

describe('checking the answers in a German form (0204)', () => {
  // The React binding's case: the button, the heading, "Change", a question left unanswered
  // (0214) and the empty review, in German.
  test('is said in German, and never in English', async () => {
    const fields = [{ key: 'name', type: 'text', label: 'Name' }]
    await mount(document_(fields), { inputs: { review: true } })
    expect(screen.queryByRole('button', { name: en('review.open') })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: de('review.open') }))
    expect(await screen.findByRole('heading', { name: de('review.heading') })).toBeTruthy()
    expect(screen.getByText(de('answer.none'))).toBeTruthy()
    expect(screen.queryByText(en('answer.none'))).toBeNull()
    TestBed.resetTestingModule()
    document.body.innerHTML = ''

    await mount(document_([{ key: 'ref', type: 'hidden' }]), { inputs: { review: true } })
    fireEvent.click(screen.getByRole('button', { name: de('review.open') }))
    expect(await screen.findByText(de('review.empty'))).toBeTruthy()
    TestBed.resetTestingModule()
    document.body.innerHTML = ''

    await mount(document_(fields), { inputs: { review: true }, initialValue: { name: 'Ada' } })
    fireEvent.click(screen.getByRole('button', { name: de('review.open') }))
    expect(await screen.findByRole('button', { name: `${de('review.change')} Name` })).toBeTruthy()
  })
})

describe('a character count in a German form (0203)', () => {
  // The React binding's case: the limit, what is left and how many too many, in German.
  test('is said in German, and never in English', async () => {
    const note = [{ key: 'notiz', type: 'textarea', label: 'Notiz', maxLength: 10 }]
    for (const [value, id, count] of [
      [undefined, 'count.limit', 10],
      ['Hallo', 'count.left', 5],
      ['Hallo Welt!', 'count.over', 1],
    ] as const) {
      await mount(document_(note), value === undefined ? {} : { initialValue: { notiz: value } })
      expect(screen.getByText(de(id, { count }))).toBeTruthy()
      expect(screen.queryByText(en(id, { count }))).toBeNull()
      TestBed.resetTestingModule()
      document.body.innerHTML = ''
    }
  })
})

describe('every error in a German form', () => {
  /**
   * Each word an error is said with, with a field that reports it and what its sentence is
   * filled with (0191). The ids are written out, so this is where a German form's every error
   * is found by its German words, as every other surface of the form is.
   */
  const stored = (name: string, size: number, contentType: string): StoredFile => ({
    id: name,
    name,
    size,
    contentType,
    storageKey: `k/${name}`,
  })
  const options = [
    { value: 'a', label: 'A' },
    { value: 'b', label: 'B' },
  ]
  const ERRORS: Record<string, { field: Record<string, unknown>; value?: unknown; values?: Record<string, string | number> }> = {
    'error.required': { field: { type: 'text', required: true } },
    'error.required.checkbox': { field: { type: 'checkbox', required: true }, value: false },
    'error.required.rows': { field: { type: 'repeater', required: true, fields: [{ key: 'x', type: 'text', label: 'X' }] } },
    'error.required.files': { field: { type: 'file', required: true }, value: [] },
    'error.invalid': { field: { type: 'text' }, value: 'x' },
    'error.check_unavailable': { field: { type: 'text' }, value: 'x' },
    'error.type': { field: { type: 'text' }, value: { x: 1 } },
    'error.option': { field: { type: 'select', options }, value: 'z' },
    'error.duplicate': { field: { type: 'ranking', options }, value: ['a', 'a'] },
    'error.exclusive': { field: { type: 'selectboxes', options: [...options, { value: 'n', label: 'N', exclusive: true }] }, value: ['a', 'n'] },
    'error.row': { field: { type: 'matrix', options, rows: [{ value: 'r', label: 'R' }] }, value: { q: 'a' } },
    'error.min': { field: { type: 'number', min: 1500 }, value: 3, values: { min: '1.500' } },
    'error.max': { field: { type: 'number', max: 9 }, value: 10, values: { max: '9' } },
    'error.step': { field: { type: 'number', step: 5 }, value: 3, values: { step: '5' } },
    'error.minLength': { field: { type: 'text', minLength: 5 }, value: 'ab', values: { count: 5 } },
    'error.maxLength': { field: { type: 'text', maxLength: 2 }, value: 'abc', values: { count: 2 } },
    'error.pattern': { field: { type: 'text', pattern: '[A-Z]{3}' }, value: 'ab' },
    'error.mask': { field: { type: 'text', mask: '999' }, value: 'ab' },
    'error.email': { field: { type: 'text', format: 'email' }, value: 'x' },
    'error.url': { field: { type: 'text', format: 'url' }, value: 'x' },
    'error.uuid': { field: { type: 'text', format: 'uuid' }, value: 'x' },
    'error.shape': { field: { type: 'date' }, value: '2026-1-1', values: { format: 'YYYY-MM-DD' } },
    'error.earliest': { field: { type: 'date', earliest: '2027-05-03' }, value: '2027-01-01', values: { earliest: '3. Mai 2027' } },
    'error.latest': { field: { type: 'date', latest: '2027-05-03' }, value: '2027-06-01', values: { latest: '3. Mai 2027' } },
    'error.minItems.choices': { field: { type: 'selectboxes', options, minItems: 2 }, value: ['a'], values: { count: 2 } },
    'error.maxItems.choices': { field: { type: 'selectboxes', options, maxItems: 1 }, value: ['a', 'b'], values: { count: 1 } },
    'error.minItems.files': { field: { type: 'file', minItems: 2 }, value: [stored('a.pdf', 3, 'application/pdf')], values: { count: 2 } },
    'error.maxItems.files': {
      field: { type: 'file', maxItems: 1 },
      value: [stored('b.pdf', 3, 'application/pdf'), stored('c.pdf', 3, 'application/pdf')],
      values: { count: 1 },
    },
    // Rows are topped up to `minItems` when the form opens, so fewer is a host's write.
    'error.minItems.rows': { field: { type: 'repeater', minItems: 2, fields: [{ key: 'x', type: 'text', label: 'X' }] }, values: { count: 2 } },
    'error.maxItems.rows': {
      field: { type: 'repeater', maxItems: 1, fields: [{ key: 'x', type: 'text', label: 'X' }] },
      value: [{ _id: 'r1' }, { _id: 'r2' }],
      values: { count: 1 },
    },
    'error.maxFileSize': { field: { type: 'file', maxFileSize: 2_000_000 }, value: [stored('d.pdf', 3_000_000, 'application/pdf')], values: { maxFileSize: '2 MB' } },
    'error.accept': { field: { type: 'file', accept: ['.pdf'] }, value: [stored('e.png', 3, 'image/png')], values: { accept: '.pdf' } },
    'error.box': { field: { type: 'signature', box: [100, 50] }, value: { drawn: [[[200, 10]]] } },
    'error.maxPoints': { field: { type: 'signature', box: [100, 50], maxPoints: 1 }, value: { drawn: [[[1, 1], [2, 2]]] } },
  }
  const keyOf = (id: string): string => id.replace(/[^a-zA-Z]/g, '_')

  test('is said in German, by the word for its code, with the field’s own limit in it', async () => {
    const fields = Object.entries(ERRORS).map(([id, { field }]) => ({ key: keyOf(id), label: id, ...field }))
    const uploader: Uploader = async () => stored('x.pdf', 1, 'application/pdf')
    const engine = await mount(
      document_(fields, {
        logic: {
          rules: [
            { kind: 'validate', target: keyOf('error.invalid'), cel: 'false' },
            // A check runs on the server unless it says otherwise, and this one is asked in the browser.
            { kind: 'check', target: keyOf('error.check_unavailable'), check: 'lookup', runsOn: 'both' },
          ],
        },
      }),
      {
        providers: [provideFormancyUploader(uploader)],
        initialValue: Object.fromEntries(
          Object.entries(ERRORS).flatMap(([id, { value }]) => (value === undefined ? [] : [[keyOf(id), value]])),
        ),
      },
    )
    engine.setValue([keyOf('error.minItems.rows')], [])
    // A check runs when its answer is written, and a value handed in is not a write.
    engine.setValue([keyOf('error.check_unavailable')], 'y')

    fireEvent.click(screen.getByRole('button', { name: de('form.submit') }))

    for (const [id, { values }] of Object.entries(ERRORS)) {
      const sentence = de(id as FormWordId, values)
      await waitFor(() => expect(screen.getAllByText(sentence, { selector: '[data-formancy-code]' }).length, id).toBeGreaterThan(0))
    }
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
      expect(status('file-status')).toBe(text('file.status.failedSeveral', { count: 2, names: ['a.pdf', 'b.pdf'] })),
    )
    expect(status('file-status')).toContain('a.pdf und b.pdf')
  })

  test('joins the files’ names in the language of the sentence they are put into', async () => {
    // A host's Italian with no word for the failure falls back to the English sentence,
    // and the names were joined in Italian inside it: "2 files were not attached: a.pdf e
    // b.pdf." — announced to a screen-reader user in neither language.
    const settlers: Array<(error: unknown) => void> = []
    const uploader: Uploader = () => new Promise<StoredFile>((_, reject) => settlers.push(reject))
    await mount(document_([{ key: 'evidence', type: 'file', label: 'Prove' }]), {
      locale: 'it',
      words: { it: { 'form.next': 'Avanti' } },
      providers: [provideFormancyUploader(uploader)],
    })

    fireEvent.change(screen.getByLabelText('Prove'), { target: { files: [pdf('a.pdf'), pdf('b.pdf')] } })
    await waitFor(() => expect(settlers).toHaveLength(1))
    settlers[0]!(new Error('no'))
    await waitFor(() => expect(settlers).toHaveLength(2))
    settlers[1]!(new Error('no'))

    await waitFor(() => expect(status('file-status')).toBe('2 files were not attached: a.pdf and b.pdf.'))
  })

  test('says a file waits its turn in German', async () => {
    // The visible word on a file queued behind another: the one row state no other case
    // reached, so a literal written back there went unnoticed by every case but the guard.
    await mount(document_([{ key: 'evidence', type: 'file', label: 'Belege' }]), {
      providers: [provideFormancyUploader(() => new Promise<StoredFile>(() => undefined))],
    })

    fireEvent.change(screen.getByLabelText('Belege'), { target: { files: [pdf('a.pdf'), pdf('b.pdf')] } })

    const waiting = await screen.findByText(de('file.waiting'))
    expect(waiting.closest('[data-formancy-part="file-item"]')?.textContent).toContain('b.pdf')
    expect(screen.queryByText(en('file.waiting'))).toBeNull()
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

  test('says what a search is doing in German: too short, searching, capped, held, withheld, more, failed', async () => {
    let answer: (rows: unknown) => void = () => undefined
    let fail: (error: unknown) => void = () => undefined
    const sources: OptionsSources = {
      orte: {
        debounceMs: 0,
        minQueryLength: 2,
        maxRows: 1,
        resolve: () =>
          new Promise((resolve, reject) => {
            answer = resolve as (rows: unknown) => void
            fail = reject
          }),
      },
    }
    await mount(
      document_([{ key: 'ort', type: 'select', widget: 'typeahead', label: 'Ort', optionsSource: 'orte' }]),
      { providers: [provideFormancyOptionsSources(sources)] },
    )
    const box = screen.getByRole('combobox', { name: 'Ort' })
    const busy = (): string | null => box.getAttribute('aria-busy')

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

    // Held while the next search is on its way, rather than replaced by "Suche…" and said
    // again once it settles: it describes the rows still on screen.
    fireEvent.input(box, { target: { value: 'Zug' } })
    await waitFor(() => expect(busy()).toBe('true'))
    expect(status('typeahead-status')).toBe(de('options.capped', { shown: 1, total: 2 }))
    answer({ options: [{ value: 'ZG', label: 'Zug' }], more: false, withheld: 1 })
    await waitFor(() => expect(status('typeahead-status')).toBe(de('options.withheld', { count: 1 })))

    fireEvent.input(box, { target: { value: 'Zu' } })
    await waitFor(() => expect(busy()).toBe('true'))
    answer({ options: [{ value: 'ZG', label: 'Zug' }], more: true })
    await waitFor(() => expect(status('typeahead-status')).toBe(de('options.more', { count: 1 })))

    fireEvent.input(box, { target: { value: 'Zugs' } })
    await waitFor(() => expect(busy()).toBe('true'))
    fail(new Error('down'))
    await waitFor(() => expect(status('typeahead-status')).toBe(de('options.failed')))
    // Every theme styles a failure by this. It was decided by whether the sentence began
    // "The options could not", so in German a failure was drawn as a hint.
    expect(part('typeahead-status')?.getAttribute('data-state')).toBe('failed')
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
    // Its own failure, which says it asks again when the person moves to it: nobody can
    // type into a list, so the typeahead's "type to try again" was a promise it broke.
    await waitFor(() => expect(status('select-status')).toBe(de('options.failedListed')))
  })

  // The React binding's case: a list of ticks' failure says only that, and its button asks
  // again (0215).
  test('says a list of ticks’ failed source and its way to ask again, in German', async () => {
    const sources: OptionsSources = { orte: { debounceMs: 0, resolve: () => Promise.reject(new Error('down')) } }
    await mount(document_([{ key: 'orte', type: 'selectboxes', label: 'Orte', optionsSource: 'orte' }]), {
      providers: [provideFormancyOptionsSources(sources)],
    })
    await waitFor(() => expect(status('checkbox-status')).toBe(de('options.failedTicks')))
    expect(await screen.findByRole('button', { name: de('options.retry') })).toBeTruthy()
    expect(screen.queryByRole('button', { name: en('options.retry') })).toBeNull()
  })

  test('says what a plain select’s list leaves out in German: capped, more, search only', async () => {
    // A list nobody can type into has sentences of its own, and each is found here by its
    // German, so one written back as English, or as the typeahead's, fails by name.
    const ORTE = [
      { value: 'ZH', label: 'Zürich' },
      { value: 'ZG', label: 'Zug' },
      { value: 'BE', label: 'Bern' },
    ]
    const select = document_([{ key: 'ort', type: 'select', label: 'Ort', optionsSource: 'orte' }])
    const answering = (answer: unknown, extra: { minQueryLength?: number } = {}): OptionsSources => ({
      orte: { debounceMs: 0, maxRows: 2, ...extra, resolve: () => Promise.resolve(answer) as never },
    })

    await mount(select, { providers: [provideFormancyOptionsSources(answering(ORTE))] })
    await waitFor(() => expect(status('select-status')).toBe(de('options.cappedListed', { count: 2, total: 3 })))
    TestBed.resetTestingModule()
    document.body.innerHTML = ''

    await mount(select, { providers: [provideFormancyOptionsSources(answering({ options: ORTE, more: true }))] })
    await waitFor(() => expect(status('select-status')).toBe(de('options.moreListed', { count: 2 })))
    TestBed.resetTestingModule()
    document.body.innerHTML = ''

    await mount(select, { providers: [provideFormancyOptionsSources(answering(ORTE, { minQueryLength: 2 }))] })
    await waitFor(() => expect(status('select-status')).toBe(de('options.searchOnly')))
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
    // All three sentences, not only the emphasised one: a paragraph whose middle is German
    // and whose ends are English is the half-translated form at its most visible.
    const paragraph = screen.getByText(de('resume.breaking.cannotSubmit')).parentElement!
    expect(paragraph.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      [de('resume.breaking.kept'), de('resume.breaking.cannotSubmit'), de('resume.breaking.restart')].join(' '),
    )
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

  test('a host’s English, on a form with no catalogue and on one in a language nobody wrote', async () => {
    // A document with no `i18n` section gives the engine the empty locale, and the host's
    // words were never read for it: `{ en: … }` was ignored on the commonest kind of form.
    const words = { en: { 'form.submit': 'Send', 'form.next': 'Continue' } }
    await mount(document_([{ key: 'name', type: 'text', label: 'Name' }]), { locale: '', words })
    expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy()
    TestBed.resetTestingModule()
    document.body.innerHTML = ''

    // Nor was it read as the last word before the shipped English, for a language the host
    // did not translate.
    await mount(PAGED, { locale: 'it', words })
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy()
  })
})

describe('the words follow the language the questions are read in', () => {
  // English and German, and nothing else. A locale the document has no catalogue for is
  // read in its default, English.
  const BILINGUAL = document_([{ key: 'name', type: 'text', label: { $t: 'name' } }], {
    i18n: { defaultLocale: 'en', messages: { en: { name: 'Your name' }, de: { name: 'Ihr Name' } } },
  })

  test.each(['fr', 'de-CH'])('a reader asking for %s, which the document lacks, reads English around English questions', async (locale) => {
    // The words were chosen by the engine's locale and the questions by the catalogue it
    // resolves in: English questions with "Envoyer" under them, and for a Swiss reader of
    // a German catalogue, "Absenden" — a form in two languages, the defect turned round.
    await mount(BILINGUAL, { locale })

    expect(screen.getByRole('textbox', { name: 'Your name' })).toBeTruthy()
    expect(screen.getByRole('button', { name: en('form.submit') })).toBeTruthy()
  })

  test('a reader asking for a language the document has reads both in it', async () => {
    // The same choice made the other way: a catalogue the document has is the words' too.
    await mount(BILINGUAL, { locale: 'de' })

    expect(screen.getByRole('textbox', { name: 'Ihr Name' })).toBeTruthy()
    expect(screen.getByRole('button', { name: de('form.submit') })).toBeTruthy()
  })
})
