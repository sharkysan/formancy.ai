import { Component, provideZonelessChangeDetection } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/angular'
import { afterEach, describe, expect, test } from 'vitest'
import { createFormEngine } from '@formancy/core'
import type { FormEngine } from '@formancy/core'
import { FORM_WORDS, FORM_WORDS_DE } from '@formancy/core/words'
import { FIELD_TYPES, WIDGETS_BY_FIELD_TYPE } from '@formancy/spec'
import type { FieldDef, FieldType, FieldWidget, FormSchema } from '@formancy/spec'
import { focusControl } from '../../src/focus-control.js'
import { FormancyErrorSummary, FormancyForm, provideFormancy, provideFormancyUploader } from '../../src/index'
import type { Uploader } from '../../src/index'
import { provideFormancyMaterial } from './index'

/**
 * What the shared fixtures do not reach (0132): the types no fixture uses, the variants
 * Material hands back to the default controls, and the places Material and the engine
 * both have an opinion — the error, the description, the required marker, the id a
 * summary links to.
 */
afterEach(() => {
  TestBed.resetTestingModule()
  document.body.innerHTML = ''
})

const form = (fields: unknown[]): FormSchema =>
  ({ specVersion: '4', id: 'm', title: 'M', model: { fields } }) as unknown as FormSchema

async function mount(document: FormSchema): Promise<FormEngine> {
  const engine = createFormEngine({
    schema: document,
    capabilities: { now: () => 0, today: () => '2026-10-09', random: () => 0.5 },
  })
  const view = await render(FormancyForm, {
    providers: [
      provideZonelessChangeDetection(),
      provideFormancy(engine),
      ...provideFormancyMaterial(),
    ],
    inputs: { submitLabel: 'Submit' },
  })
  await view.fixture.whenStable()
  return engine
}

describe('a field Material draws', () => {
  test.each([
    ['text', { key: 'a', type: 'text', label: 'A' }],
    ['textarea', { key: 'a', type: 'textarea', label: 'A' }],
    ['number', { key: 'a', type: 'number', label: 'A' }],
    ['date', { key: 'a', type: 'date', label: 'A' }],
    ['time', { key: 'a', type: 'time', label: 'A' }],
    ['select', { key: 'a', type: 'select', label: 'A', options: [{ value: 'x', label: 'X' }] }],
  ])('a %s is a control in Material’s form field, found by its name', async (_type, field) => {
    await mount(form([field]))

    const control = screen.getByLabelText('A')
    expect(control.closest('mat-form-field')).not.toBeNull()
  })

  // A computed value is the engine's (0181). Material's form field has the default
  // controls' read-only state, through `matInput`, and a field it draws without it is a
  // total a person types into and watches the engine take back.
  test.each([
    ['text', "'fixed'"],
    ['textarea', "'fixed'"],
    ['number', '1.0'],
    ['date', "'2026-10-09'"],
    ['time', "'09:30'"],
  ])('a %s a computed rule writes is read-only, and not disabled', async (type, cel) => {
    await mount({
      ...form([{ key: 'a', type, label: 'A' }]),
      logic: { rules: [{ target: 'a', kind: 'computed', cel }] },
    })

    const control = screen.getByLabelText('A') as HTMLInputElement
    expect(control.readOnly).toBe(true)
    expect(control.disabled).toBe(false)
  })

  test('a date is stored as the calendar day typed, and a time as HH:MM', async () => {
    const engine = await mount(
      form([
        { key: 'day', type: 'date', label: 'Day' },
        { key: 'at', type: 'time', label: 'At' },
      ]),
    )

    fireEvent.input(screen.getByLabelText('Day'), { target: { value: '2026-10-09' } })
    fireEvent.input(screen.getByLabelText('At'), { target: { value: '09:30' } })

    expect(engine.value()).toEqual({ day: '2026-10-09', at: '09:30' })
  })

  test('a checkbox, a radio group and a group of ticks are Material’s, and store what the defaults store', async () => {
    const engine = await mount(
      form([
        { key: 'ok', type: 'checkbox', label: 'Agree' },
        {
          key: 'size',
          type: 'radio',
          label: 'Size',
          options: [
            { value: 's', label: 'Small' },
            { value: 'l', label: 'Large' },
          ],
        },
        {
          key: 'extras',
          type: 'selectboxes',
          label: 'Extras',
          options: [
            { value: 'wrap', label: 'Wrap' },
            { value: 'card', label: 'Card' },
          ],
        },
      ]),
    )

    fireEvent.click(screen.getByLabelText('Agree'))
    fireEvent.click(within(screen.getByRole('group', { name: 'Size' })).getByLabelText('Large'))
    const extras = screen.getByRole('group', { name: 'Extras' })
    // Ticked in the other order, stored in the options' order, as the default control does.
    fireEvent.click(within(extras).getByLabelText('Card'))
    fireEvent.click(within(extras).getByLabelText('Wrap'))

    expect(screen.getByLabelText('Agree').closest('mat-checkbox')).not.toBeNull()
    expect(screen.getByLabelText('Large').closest('mat-radio-group')).not.toBeNull()
    expect(engine.value()).toEqual({ ok: true, size: 'l', extras: ['wrap', 'card'] })
  })

  // In the engine's order, as the default control draws it (0200): Material's options are its
  // own list, and one that ignored the order would show the written order to some people only.
  test('a shuffled radio group draws its options in the engine’s order, the one that keeps its place last', async () => {
    const options = [
      { value: 'friend', label: 'A friend' },
      { value: 'press', label: 'The press' },
      { value: 'search', label: 'A search' },
      { value: 'none', label: 'None of these', keepPlace: true },
    ]
    const document = { ...form([{ key: 'channel', type: 'radio', label: 'Channel', shuffle: true, options }]), specVersion: '5' } as FormSchema
    const engine = createFormEngine({ schema: document, capabilities: { now: () => 0, today: () => '2026-10-27', random: () => 0 } })
    const view = await render(FormancyForm, {
      providers: [provideZonelessChangeDetection(), provideFormancy(engine), ...provideFormancyMaterial()],
      inputs: { submitLabel: 'Submit' },
    })
    await view.fixture.whenStable()

    const group = screen.getByRole('group', { name: 'Channel' })
    expect(within(group).getByLabelText('A friend').closest('mat-radio-group')).not.toBeNull()
    expect(within(group).getAllByRole('radio').map((radio) => (radio as HTMLInputElement).value)).toEqual(['press', 'search', 'friend', 'none'])
  })

  // The default control's count, outside Material's form field, named by the box (0203).
  test('a text and a long text with a limit show the character count the default control shows', async () => {
    await mount(form([
      { key: 'a', type: 'text', label: 'A', maxLength: 5 },
      { key: 'b', type: 'textarea', label: 'B', maxLength: 7 },
    ]))
    for (const [label, limit] of [['A', 5], ['B', 7]] as const) {
      const count = screen.getByText(`You can enter up to ${String(limit)} characters.`)
      expect(screen.getByLabelText(label).getAttribute('aria-describedby')?.split(' ')).toContain(count.id)
    }
  })

  // An option chosen alone or not at all, as the default control ticks it (0199).
  test('an exclusive option in a group of ticks clears the rest, and is cleared by another', async () => {
    const engine = await mount({
      ...form([
        {
          key: 'extras',
          type: 'selectboxes',
          label: 'Extras',
          options: [
            { value: 'wrap', label: 'Wrap' },
            { value: 'card', label: 'Card' },
            { value: 'none', label: 'Nothing extra', exclusive: true },
          ],
        },
      ]),
      specVersion: '5',
    } as FormSchema)
    const extras = screen.getByRole('group', { name: 'Extras' })

    fireEvent.click(within(extras).getByLabelText('Wrap'))
    fireEvent.click(within(extras).getByLabelText('Nothing extra'))
    expect(engine.value()).toEqual({ extras: ['none'] })
    fireEvent.click(within(extras).getByLabelText('Card'))
    expect(engine.value()).toEqual({ extras: ['card'] })
  })
})

describe('what Material cannot draw', () => {
  test.each([
    ['a mask', { key: 'a', type: 'text', label: 'A', mask: '999' }],
    ['a rating', { key: 'a', type: 'number', label: 'A', widget: 'rating', min: 1, max: 5 }],
    [
      'a typeahead',
      {
        key: 'a',
        type: 'select',
        label: 'A',
        widget: 'typeahead',
        options: [{ value: 'x', label: 'X' }],
      },
    ],
  ])('%s is drawn by the default control, not dropped', async (_what, field) => {
    await mount(form([field]))

    // The default control's markup: no Material form field anywhere on the page.
    expect(document.querySelector('mat-form-field')).toBeNull()
    expect(document.querySelector('[data-formancy-field-path="a"]')).not.toBeNull()
  })

  test('a picture on an option is drawn by the default radio group', async () => {
    await mount(
      form([
        {
          key: 'a',
          type: 'radio',
          label: 'A',
          options: [{ value: 'x', label: 'X', image: { src: '/x.png', alt: 'An x' } }],
        },
      ]),
    )

    expect(document.querySelector('mat-radio-group')).toBeNull()
    expect(document.querySelector('[data-formancy-part="option-image"]')).not.toBeNull()
  })
})

describe('where Material and the engine both have an opinion', () => {
  test('a required field shows Material’s marker, and its name is still the field’s name', async () => {
    // The marker is CSS on an empty aria-hidden element: nothing of it is text, so the
    // label and the accessible name are the field's name alone.
    await mount(form([{ key: 'email', type: 'text', label: 'Email', required: true }]))

    const control = screen.getByLabelText('Email')
    const marker = document.querySelector('.mat-mdc-form-field-required-marker')
    expect(marker?.getAttribute('aria-hidden')).toBe('true')
    expect(marker?.textContent).toBe('')
    expect(document.querySelector('label')?.textContent?.trim()).toBe('Email')
    expect(control.getAttribute('aria-required')).toBe('true')
  })

  test('a group carries the default control’s hooks on the frame Material does not draw', async () => {
    // Material draws the radios and the ticks, not the fieldset around them: that frame is
    // this adapter's markup. Without the hooks the default group carries, a stylesheet
    // reaches the group in one registry and not the other — the required hint stood as
    // bare text before the radios in the Angular starter.
    await mount(
      form([
        { key: 'purpose', type: 'radio', label: 'Purpose', required: true, options: [{ value: 'a', label: 'A' }] },
        { key: 'tags', type: 'selectboxes', label: 'Tags', required: true, options: [{ value: 'b', label: 'B' }] },
      ]),
    )

    for (const name of ['Purpose', 'Tags']) {
      const group = screen.getByRole('group', { name })
      expect(group.getAttribute('data-formancy-part')).toBe('field')
      expect(group.getAttribute('data-state')).toBe('valid')
      expect(group.querySelector('legend')?.getAttribute('data-formancy-part')).toBe('label')
      expect(within(group).getByText('required').getAttribute('data-formancy-part')).toBe('required-hint')
    }
  })

  test('an error is shown under the engine’s id, and read out once', async () => {
    const engine = await mount(
      form([{ key: 'email', type: 'text', label: 'Email', required: true }]),
    )
    const control = screen.getByLabelText('Email')

    // Submitted, which is when the engine says an empty required field is wrong — for
    // the default controls too; leaving it untouched-then-blurred says nothing yet.
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

    await waitFor(() =>
      expect(control.getAttribute('aria-describedby') ?? '').toContain('f:m:email:error'),
    )
    // Material adds the ids of the mat-error it shows; handed the engine's list whole,
    // the error would be described twice.
    const ids = (control.getAttribute('aria-describedby') ?? '').split(/\s+/)
    expect(ids.filter((id) => id === 'f:m:email:error')).toHaveLength(1)
    expect(document.getElementById('f:m:email:error')?.textContent?.trim()).toBe('This question needs an answer.')
    // Material's decision, not the engine's: an EMPTY required field is never marked
    // aria-invalid, so it is not announced as invalid before anything was typed. The
    // error is still its description. The default control marks it; this is the one
    // place the two differ, and it is said in 0132.
    expect(control.getAttribute('aria-invalid')).toBeNull()
    expect(engine.getFieldSnapshot(['email']).touched).toBe(true)
  })

  test('and a value that is wrong is marked invalid, as the engine says', async () => {
    await mount(form([{ key: 'code', type: 'text', label: 'Code', minLength: 5 }]))
    const control = screen.getByLabelText('Code')

    fireEvent.input(control, { target: { value: 'ab' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

    await waitFor(() => expect(control.getAttribute('aria-invalid')).toBe('true'))
  })

  test('the error summary’s link lands on Material’s checkbox', async () => {
    // The engine's control id is on mat-checkbox's host, which cannot take focus. The
    // summary is the host's to place, as it is for the default controls.
    @Component({
      selector: 'formancy-test-summary-host',
      imports: [FormancyErrorSummary, FormancyForm],
      template: `<formancy-error-summary /><formancy-form />`,
    })
    class SummaryHost {}
    const engine = createFormEngine({
      schema: form([{ key: 'ok', type: 'checkbox', label: 'Agree', required: true }]),
    })
    const view = await render(SummaryHost, {
      providers: [
        provideZonelessChangeDetection(),
        provideFormancy(engine),
        ...provideFormancyMaterial(),
      ],
    })
    await view.fixture.whenStable()

    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    // The summary names a field by the host's labels, or its path, and says the error: a
    // required tick box asks for the tick (0191).
    const link = await screen.findByRole('link', { name: /Tick this box to continue/ })
    fireEvent.click(link)

    expect(document.activeElement).toBe(screen.getByLabelText('Agree'))
  })
})

describe('a group of radios and a group of ticks, under the engine’s control id (0186)', () => {
  /*
   * Material's groups are this adapter's fieldsets, and they carried no element with the
   * engine's control id, as the default groups did not: the error summary's link and a failed
   * submit found nothing to focus. The fieldset carries it now, as the default group's does,
   * and `focusControl` moves into Material's first option, whose host keeps its own
   * `<id>:<value>`. The signature has no Material control; the default one draws it, and
   * `packages/angular/src/control-id.test.ts` holds it.
   */
  @Component({
    selector: 'formancy-test-material-summary-host',
    imports: [FormancyErrorSummary, FormancyForm],
    template: `<formancy-error-summary /><formancy-form />`,
  })
  class SummaryHost {}

  const size = {
    key: 'size',
    type: 'radio',
    label: 'Size',
    required: true,
    options: [
      { value: 's', label: 'Small' },
      { value: 'l', label: 'Large' },
    ],
  }
  const extras = {
    key: 'extras',
    type: 'selectboxes',
    label: 'Extras',
    required: true,
    options: [
      { value: 'wrap', label: 'Wrap' },
      { value: 'card', label: 'Card' },
    ],
  }

  async function mountGroups(fields: unknown[], summary: boolean): Promise<FormEngine> {
    const engine = createFormEngine({ schema: form(fields) })
    const view = await render(summary ? SummaryHost : FormancyForm, {
      providers: [provideZonelessChangeDetection(), provideFormancy(engine), ...provideFormancyMaterial()],
    })
    await view.fixture.whenStable()
    return engine
  }

  /** Each group first, then the other, so the submit's case shows it goes to the first. */
  const CASES = [
    {
      kind: 'radios',
      fields: [size, extras],
      where: 'Material’s first radio',
      link: 'Size: This question needs an answer.',
      first: () => screen.getByRole('radio', { name: 'Small' }),
    },
    {
      kind: 'ticks',
      fields: [extras, size],
      where: 'Material’s first box',
      link: 'Extras: This question needs an answer.',
      first: () => screen.getByRole('checkbox', { name: 'Wrap' }),
    },
  ]

  test('each group carries the engine’s id, and each option’s host keeps its own', async () => {
    // A host focusing a field by `ids.control` reached nothing; and the options' ids are the
    // ones Material puts on their hosts, `<id>:<value>`, which are not moved to make room.
    const engine = await mountGroups([size, extras], false)
    const sizeId = engine.getFieldSnapshot(['size']).ids.control
    const extrasId = engine.getFieldSnapshot(['extras']).ids.control

    expect(document.getElementById(sizeId)).toBe(screen.getByRole('group', { name: 'Size' }))
    expect(document.getElementById(extrasId)).toBe(screen.getByRole('group', { name: 'Extras' }))
    expect(document.getElementById(`${sizeId}:s`)?.contains(screen.getByRole('radio', { name: 'Small' }))).toBe(true)
    expect(document.getElementById(`${extrasId}:wrap`)?.contains(screen.getByRole('checkbox', { name: 'Wrap' }))).toBe(
      true,
    )
  })

  test.each(CASES)('the error summary’s link to required $kind left empty lands on $where', async ({ fields, link, first }) => {
    // The link named the group and did nothing, so focus stayed on the summary.
    await mountGroups(fields, true)

    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    fireEvent.click(await screen.findByRole('link', { name: link }))

    expect(document.activeElement).toBe(first())
  })

  test.each(CASES)(
    'a failed submit without a summary, whose first invalid field is required $kind, lands on $where',
    async ({ fields, first }) => {
      // Focus stayed where it was, so nothing said where the problem was.
      await mountGroups(fields, false)

      fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

      expect(document.activeElement).toBe(first())
    },
  )
})

describe('every field, under Material, under the engine’s control id (0186)', () => {
  /*
   * The rule the two groups above were missed by, over every type and widget the spec has,
   * with Material's registry provided: whether Material draws the field or hands it back to
   * the default control, one element carries the engine's id and focus moved by it lands in
   * the field. The table is the default renderer's, in `packages/angular/src/control-id.test.ts`,
   * so the two registries are held over the same fields; keyed by the spec's own type, so a
   * type added there without an entry here is a compile error.
   */
  const options = [
    { value: 'a', label: 'A' },
    { value: 'b', label: 'B' },
  ]
  const MINIMAL: Record<FieldType, Partial<FieldDef> | { noControl: string }> = {
    text: {},
    textarea: {},
    // Bounds, because a rating with no `max` has nothing to draw.
    number: { min: 0, max: 10 },
    checkbox: {},
    select: { options },
    radio: { options },
    selectboxes: { options },
    ranking: { options },
    matrix: { rows: options, options },
    date: {},
    time: {},
    datetime: {},
    // Drawn with the uploader every case below supplies; without one, no control (0186).
    file: {},
    richtext: {},
    signature: {},
    repeater: { fields: [{ key: 'x', type: 'text', label: 'X' }] },
    hidden: { noControl: 'it is collected without being shown' },
    static: { noControl: 'it is text to read, and takes no answer' },
    group: { noControl: 'it holds fields, each held here as itself, and takes no answer of its own' },
    page: { noControl: 'it is a step that holds fields, and takes no answer of its own' },
  }
  const widgets: Partial<Record<FieldType, readonly FieldWidget[]>> = WIDGETS_BY_FIELD_TYPE
  const DRAWN = FIELD_TYPES.flatMap((type) => {
    const minimal = MINIMAL[type]
    if ('noControl' in minimal) return []
    return [undefined, ...(widgets[type] ?? [])].map((widget) => ({
      name: widget === undefined ? `a ${type}` : `a ${type} drawn as ${widget}`,
      field: { key: 'f', type, label: 'F', ...minimal, ...(widget === undefined ? {} : { widget }) },
    }))
  })
  /** Never called: a file field draws its control only where the host can take a file. */
  const upload: Uploader = () => new Promise(() => undefined)

  test.each(DRAWN)('$name has one element with its control id, and focus moved by it lands in the field', async ({ field }) => {
    // Material's checkbox puts the id on its host and the input inside (0132), and its groups
    // carried none; a control Material draws later is held here without a case of its own.
    const engine = createFormEngine({ schema: form([field]) })
    const view = await render(FormancyForm, {
      providers: [
        provideZonelessChangeDetection(),
        provideFormancy(engine),
        provideFormancyUploader(upload),
        ...provideFormancyMaterial(),
      ],
    })
    await view.fixture.whenStable()
    const id = engine.getFieldSnapshot(['f']).ids.control
    const named = Array.from(document.querySelectorAll<HTMLElement>('[id]')).filter((element) => element.id === id)
    const drawn = document.querySelector('[data-formancy-field-path="f"]')

    expect(named).toHaveLength(1)
    expect(drawn?.contains(document.activeElement)).toBe(false)
    focusControl(named[0] ?? null)
    expect(drawn?.contains(document.activeElement)).toBe(true)
  })

  // The cases the two renderers' `control-id.test` hold a field drawn with no control to (0221),
  // with Material's registry provided: Material hands a sourced choice back to the default control.
  test.each([
    { name: 'a file field where the host takes no uploads', field: { key: 'f', type: 'file', label: 'F' }, uploads: false },
    { name: 'a select whose source the deployment lacks', field: { key: 'f', type: 'select', label: 'F', optionsSource: 'nowhere' }, uploads: true },
    { name: 'a list of ticks whose source the deployment lacks', field: { key: 'f', type: 'selectboxes', label: 'F', optionsSource: 'nowhere' }, uploads: true },
  ])('$name is reached by its control id, and focus moved by it lands on the sentence it draws', async ({ field, uploads }) => {
    const engine = createFormEngine({ schema: form([field]) })
    const view = await render(FormancyForm, {
      providers: [
        provideZonelessChangeDetection(),
        provideFormancy(engine),
        ...(uploads ? [provideFormancyUploader(upload)] : []),
        ...provideFormancyMaterial(),
      ],
    })
    await view.fixture.whenStable()
    const id = engine.getFieldSnapshot(['f']).ids.control
    const named = Array.from(document.querySelectorAll<HTMLElement>('[id]')).filter((element) => element.id === id)

    expect(named).toHaveLength(1)
    focusControl(named[0] ?? null)
    expect(document.activeElement?.getAttribute('data-formancy-part')).toMatch(/-unavailable$/)
  })

  test.each(DRAWN)('$name, under a rule that disables it, has nothing in it a person can operate', async ({ field }) => {
    // The rule `packages/angular/src/control-id.test.ts` and React's hold their controls to, by
    // the same function, with Material's registry provided: whatever draws the field, nothing in
    // it takes input under a `disabled` rule, since the engine takes a value set on a disabled
    // field (B6a, 0210). Material's radio group was disabled; the signature it hands back to the
    // default control was not. Without the rule there is something to operate, so the check
    // cannot pass by finding nothing.
    const drawnUnder = async (cel: string): Promise<Element> => {
      const engine = createFormEngine({
        schema: { ...form([field]), logic: { rules: [{ target: 'f', kind: 'disabled', cel }] } } as unknown as FormSchema,
        capabilities: { now: () => 0, today: () => '2026-10-28', random: () => 0.5 },
      })
      const view = await render(FormancyForm, {
        providers: [
          provideZonelessChangeDetection(),
          provideFormancy(engine),
          provideFormancyUploader(upload),
          ...provideFormancyMaterial(),
        ],
      })
      await view.fixture.whenStable()
      const drawn = document.querySelector('[data-formancy-field-path="f"]')
      if (drawn === null) throw new Error('the field drew nothing to look inside')
      return drawn
    }

    expect(operable(await drawnUnder('false'))).not.toEqual([])
    TestBed.resetTestingModule()
    document.body.innerHTML = ''
    expect(operable(await drawnUnder('true'))).toEqual([])
  })

  test.each(DRAWN)('$name, written by a computed rule, has nothing in it a person can change, and a read-only box to read', async ({ field }) => {
    // The rule both renderers hold their controls to, by the same function, with Material's
    // registry provided: a computed value is the engine's (0181), and a control registered by
    // type does not draw a field whose own control has no read-only state; its answer in words
    // does, in a read-only box (0216). Material's tick box, select and radio group took a change
    // the engine refused. A repeater is written two rows, as in the two renderers' rule (0218).
    const drawnWith = async (rule: { kind: 'disabled' | 'computed'; cel: string }): Promise<Element> => {
      const engine = createFormEngine({
        schema: { ...form([field]), logic: { rules: [{ target: 'f', ...rule }] } } as unknown as FormSchema,
        capabilities: { now: () => 0, today: () => '2026-10-29', random: () => 0.5 },
      })
      const view = await render(FormancyForm, {
        providers: [
          provideZonelessChangeDetection(),
          provideFormancy(engine),
          provideFormancyUploader(upload),
          ...provideFormancyMaterial(),
        ],
      })
      await view.fixture.whenStable()
      const drawn = document.querySelector('[data-formancy-field-path="f"]')
      if (drawn === null) throw new Error('the field drew nothing to look inside')
      return drawn
    }

    expect(changeable(await drawnWith({ kind: 'disabled', cel: 'false' }))).not.toEqual([])
    TestBed.resetTestingModule()
    document.body.innerHTML = ''
    const written = await drawnWith({ kind: 'computed', cel: field.type === 'repeater' ? "[{'x': 'a'}, {'x': 'b'}]" : 'null' })
    expect(changeable(written)).toEqual([])
    expect(written.querySelector('input[readonly], textarea[readonly]')).not.toBeNull()
  })

  test.each(DRAWN)('$name, required, described and sent empty, names no id that is not drawn', async ({ field }) => {
    // The rule the default renderer's and React's controls are held to (D4, 0211), with
    // Material's registry provided: whatever draws the field draws every element its ARIA names.
    const engine = createFormEngine({
      schema: {
        specVersion: '5',
        id: 'm',
        title: 'M',
        model: { fields: [{ ...field, required: true, description: 'Help.' }] },
      } as unknown as FormSchema,
    })
    const view = await render(FormancyForm, {
      providers: [
        provideZonelessChangeDetection(),
        provideFormancy(engine),
        provideFormancyUploader(upload),
        ...provideFormancyMaterial(),
      ],
      inputs: { submitLabel: 'Submit' },
    })
    await view.fixture.whenStable()
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    await view.fixture.whenStable()
    const drawn = document.querySelector('[data-formancy-field-path="f"]')
    expect(drawn).not.toBeNull()

    const named = idsNamedWithin(drawn!)
    expect(named.length).toBeGreaterThan(0)
    expect(named.filter(({ id }) => document.getElementById(id) === null)).toEqual([])
  })
})

/**
 * What inside `root` a person could still change an answer through: a form control not
 * `:disabled`, itself or through a disabled fieldset; a region still editable; or anything else
 * a keyboard reaches that does not say `aria-disabled`. The same function as the default
 * renderer's and React's.
 */
function operable(root: Element, unchangeable: (element: HTMLElement) => boolean = () => false): string[] {
  const live: string[] = []
  for (const element of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
    if (unchangeable(element)) continue
    const name = `${element.tagName.toLowerCase()}${element.getAttribute('role') ? `[role=${element.getAttribute('role')}]` : ''}${element.getAttribute('type') ? `[type=${element.getAttribute('type')}]` : ''}`
    if (element.matches('input, select, textarea, button')) {
      if (element.matches('input[type=hidden]')) continue
      if (!element.matches(':disabled')) live.push(name)
    } else if (element.isContentEditable) {
      live.push(`${name}[contenteditable]`)
    } else if (element.tabIndex >= 0 && element.getAttribute('aria-disabled') !== 'true') {
      if (element.matches('a[href]')) continue
      live.push(name)
    }
  }
  return live
}

/** `operable`'s list, less a box drawn `readonly`: the same function as the two renderers'. */
function changeable(root: Element): string[] {
  return operable(root, (element) => element.matches('input[readonly], textarea[readonly]'))
}

/** Every id an element inside `root`, or `root` itself, points at, with the attribute that names it. */
function idsNamedWithin(root: Element): Array<{ id: string; by: string }> {
  const ATTRIBUTES = ['aria-describedby', 'aria-labelledby', 'aria-controls', 'aria-errormessage', 'aria-activedescendant', 'aria-owns', 'for']
  const named: Array<{ id: string; by: string }> = []
  for (const element of [root, ...Array.from(root.querySelectorAll('*'))]) {
    for (const by of ATTRIBUTES) {
      for (const id of (element.getAttribute(by) ?? '').split(/\s+/)) {
        if (id !== '') named.push({ id, by: `${element.tagName.toLowerCase()}[${by}]` })
      }
    }
  }
  return named
}

describe('Material in the form’s language', () => {
  test('a group of radios and a group of ticks say they are required in German', async () => {
    // Material's groups draw the hint themselves rather than through the default control,
    // so a German form would have said "required" beside Material's radios and nowhere
    // else (0171). Read off the shipped catalogue, not through the function the control asks.
    const engine = createFormEngine({
      schema: form([
        { key: 'size', type: 'radio', label: 'Grösse', required: true, options: [{ value: 's', label: 'Klein' }] },
        { key: 'extras', type: 'selectboxes', label: 'Extras', required: true, options: [{ value: 'm', label: 'Milch' }] },
      ]),
      locale: 'de',
    })
    const view = await render(FormancyForm, {
      providers: [provideZonelessChangeDetection(), provideFormancy(engine), ...provideFormancyMaterial()],
    })
    await view.fixture.whenStable()

    for (const name of ['Grösse', 'Extras']) {
      const group = screen.getByRole('group', { name })
      expect(within(group).getByText(FORM_WORDS_DE['form.required'])).toBeTruthy()
      expect(within(group).queryByText(FORM_WORDS['form.required'])).toBeNull()
    }
    expect(screen.getByRole('button', { name: FORM_WORDS_DE['form.submit'] })).toBeTruthy()
  })
})
