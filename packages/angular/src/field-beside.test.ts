import { ChangeDetectionStrategy, Component, provideZonelessChangeDetection, viewChild } from '@angular/core'
import type { TemplateRef } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { fireEvent, render, screen, waitFor } from '@testing-library/angular'
import { afterEach, describe, expect, test } from 'vitest'
import { createFormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { FormancyForm, provideFormancy, provideFormancyOptionsSources } from './index'
import type { FormancyFieldBeside, FormancyFieldBesideContext, OptionsSources } from './index'

afterEach(() => {
  TestBed.resetTestingModule()
  document.body.innerHTML = ''
})

/**
 * The React binding's `field-beside.test.tsx`, case for case (0237): what a host draws beside a
 * field's control, on the control's own line. Only a select and a typeahead draw it, the box and
 * the host's content wrapped in one row, and nothing at all where the host gives none.
 *
 * The row and the place beside are read from the DOM by their parts, because they have no role
 * and no name by design: an accessibility tree has nothing to say about them, and a part a theme
 * selects on is what they are for. The keyboard's order is read from the DOM too, because jsdom
 * has no Tab and this package has no user-event: what is reached next is the next element that
 * takes focus in document order, which is the browser's order where no tabindex is positive.
 * Everything a person reaches is found by role and name.
 */
const COUNTRIES = [
  { value: 'CH', label: 'Switzerland' },
  { value: 'DE', label: 'Germany' },
]

// The country's options come from a source so that its status region is drawn, and where it
// lands beside the row is checked: a select with its document's options has none.
const sources: OptionsSources = {
  countries: {
    debounceMs: 0,
    resolve: (request) => Promise.resolve(request.kind === 'labels' ? COUNTRIES.filter((row) => request.values.includes(row.value)) : COUNTRIES),
  },
}

const form: FormSchema = {
  specVersion: '5',
  id: 'delivery',
  title: 'Delivery',
  model: {
    fields: [
      { key: 'country', type: 'select', label: 'Country', optionsSource: 'countries', required: true },
      {
        key: 'point',
        type: 'select',
        label: 'Pickup point',
        widget: 'typeahead',
        options: [
          { value: 'bern', label: 'Bern Bahnhof' },
          { value: 'thun', label: 'Thun Bahnhof' },
        ],
      },
      // A source this deployment does not have: the select draws a sentence in its box's place.
      { key: 'depot', type: 'select', label: 'Depot', optionsSource: 'depots' },
      { key: 'name', type: 'text', label: 'Name' },
    ],
  },
}

const CLOCK = { now: () => 0, today: () => '2026-11-15', random: () => 0.5 }

/** Which of the host's templates it gives for a path, and every path it was asked about. */
type Drawn = 'open' | 'chosen' | 'said' | 'nothing'
let drawn: (path: string) => Drawn | undefined = () => undefined
let asked: string[] = []

@Component({
  imports: [FormancyForm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <formancy-form [fieldBeside]="beside" />
    <ng-template #open let-path><button type="button">Open {{ path }}</button></ng-template>
    <ng-template #chosen let-field="field"><span>Chosen: {{ field.snapshot().value ?? 'nothing' }}</span></ng-template>
    <ng-template #said let-path let-field="field"><span>{{ path }} holds {{ field.snapshot().value ?? 'nothing' }}</span></ng-template>
    <ng-template #nothing let-field="field">@if (field.snapshot().value) {<span>Chosen</span>}</ng-template>
  `,
})
class Host {
  // Each a field of its own: the compiler sees a query only where it initialises a field.
  private readonly open = viewChild<TemplateRef<FormancyFieldBesideContext>>('open')
  private readonly chosen = viewChild<TemplateRef<FormancyFieldBesideContext>>('chosen')
  private readonly said = viewChild<TemplateRef<FormancyFieldBesideContext>>('said')
  private readonly nothing = viewChild<TemplateRef<FormancyFieldBesideContext>>('nothing')
  protected readonly beside: FormancyFieldBeside = (path) => {
    asked.push(path)
    const which = drawn(path)
    return which === undefined ? undefined : this[which]()
  }
}

async function mount(only: (path: string) => Drawn | undefined, initialValue?: Record<string, unknown>): Promise<() => Promise<void>> {
  drawn = only
  asked = []
  const view = await render(Host, {
    providers: [
      provideZonelessChangeDetection(),
      provideFormancy(createFormEngine({ schema: form, capabilities: CLOCK, ...(initialValue === undefined ? {} : { initialValue }) })),
      provideFormancyOptionsSources(sources),
    ],
  })
  await answered()
  return () => view.fixture.whenStable()
}

/** The form alone, with no content beside given: what a form drawn today looks like. */
async function mountPlain(): Promise<void> {
  await render(FormancyForm, {
    providers: [
      provideZonelessChangeDetection(),
      provideFormancy(createFormEngine({ schema: form, capabilities: CLOCK })),
      provideFormancyOptionsSources(sources),
    ],
  })
  await answered()
}

/** Until the country's source has answered, so two forms compared are in the same state. */
const answered = () => waitFor(() => expect(screen.getByRole('option', { name: 'Germany' })).toBeTruthy())

const wrapperOf = (path: string) => document.querySelector(`[data-formancy-part="field"][data-formancy-field-path="${path}"]`)
const partsOf = (element: Element | null | undefined) =>
  [...(element?.children ?? [])].map((child) => child.getAttribute('data-formancy-part') ?? child.tagName.toLowerCase())
const rowOf = (path: string) => wrapperOf(path)?.querySelector('[data-formancy-part="field-control-row"]')
const besides = () => [...document.querySelectorAll('[data-formancy-part="field-beside"]')]
const besideOf = (element: Element | null) => element?.closest('[data-formancy-part="field-beside"]')?.parentElement

/**
 * Every field's elements and attributes, without what Angular adds of its own: the comments it
 * anchors its blocks and its outlets with, and the attributes that scope a component's styles.
 * Taken out of a copy of the tree rather than out of its text, as the addition's test does.
 */
const markup = () =>
  [...document.querySelectorAll('[data-formancy-part="field"]')].map((field) => {
    const copy = field.cloneNode(true) as Element
    const comments = document.createTreeWalker(copy, NodeFilter.SHOW_COMMENT)
    const anchors: Node[] = []
    while (comments.nextNode()) anchors.push(comments.currentNode)
    for (const anchor of anchors) anchor.parentNode?.removeChild(anchor)
    for (const element of [copy, ...copy.querySelectorAll('*')]) {
      for (const name of element.getAttributeNames()) if (name.startsWith('_ng')) element.removeAttribute(name)
    }
    return copy.outerHTML
  })

/** What takes focus, in document order: the order Tab moves through where no tabindex is positive. */
const tabbables = () =>
  [...document.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]')].filter(
    (element) => element.tabIndex >= 0 && !(element as HTMLButtonElement).disabled && element.closest('[hidden]') === null,
  )

describe('content beside a field’s control', () => {
  // A host that gives none, or gives nothing for a path, changes no form: not an empty row, and
  // not an attribute, so a form drawn today is drawn the same.
  test('draws nothing where the host gives nothing, so the form is unchanged', async () => {
    await mountPlain()
    const without = markup()
    TestBed.resetTestingModule()
    document.body.innerHTML = ''

    await mount(() => undefined)

    expect(document.querySelector('[data-formancy-part="field-control-row"]')).toBeNull()
    expect(without).toHaveLength(4)
    expect(markup()).toEqual(without)
  })

  // The row holds the box and the host's content and nothing else: a status region or an error
  // inside it would be laid out beside the box, on the control's line, rather than under it.
  test('wraps the select and the host’s content in one row, before the select’s status', async () => {
    await mount(() => 'open')
    screen.getByRole('button', { name: /submit/i }).click()
    // A failed submit marks the field touched, and its error is drawn once the engine has run.
    await waitFor(() => expect(wrapperOf('country')?.querySelector('[data-formancy-part="error"]')).not.toBeNull())

    const wrapper = wrapperOf('country')
    expect(partsOf(wrapper)).toEqual(['label', 'field-control-row', 'select-status', 'error'])
    expect(partsOf(rowOf('country'))).toEqual(['select', 'field-beside'])
    expect(rowOf('country')?.querySelector('select')).toBe(screen.getByRole('combobox', { name: 'Country' }))
    expect(besideOf(screen.getByRole('button', { name: 'Open country' }))).toBe(rowOf('country'))
  })

  // The anchor is the popup's containing block and must wrap the box and its list alone, or the
  // list opens under the row, the host's button included; the status stays a row of the field.
  test('wraps the typeahead’s anchor and not its list or status', async () => {
    await mount(() => 'open')

    const wrapper = wrapperOf('point')
    const anchor = screen.getByRole('combobox', { name: 'Pickup point' }).parentElement
    expect(partsOf(rowOf('point'))).toEqual(['typeahead-anchor', 'field-beside'])
    expect(anchor?.parentElement).toBe(rowOf('point'))
    expect(partsOf(anchor)).toEqual(['typeahead', 'typeahead-listbox'])
    expect(wrapper?.querySelector('[data-formancy-part="typeahead-status"]')?.parentElement).toBe(wrapper)
  })

  // A text field, a fieldset or a select whose source is missing has no single box on a line of
  // its own to join a button to; asked for one, a host would draw content nobody places.
  test('is asked for by the select and the typeahead alone', async () => {
    await mount(() => undefined)

    // Once per path, in the order the fields are drawn, however often a field is drawn again.
    expect([...new Set(asked)]).toEqual(['country', 'point'])
  })

  // Angular's counterpart of React's `useField(path)`: a component cannot ask for a binding by a
  // path that only arrives as its input, so the template is handed it, and a button that opens
  // the chosen record reads the answer there.
  test('reads the field’s value through the binding its template is given', async () => {
    await mount(() => 'chosen', { country: 'CH' })

    expect(besideOf(screen.getByText('Chosen: CH'))).toBe(rowOf('country'))
    expect(besideOf(screen.getByText('Chosen: nothing'))).toBe(rowOf('point'))
  })

  // The control is described by its description and its error, as before: a button beside it,
  // flattened into the control's description, would be read out with every visit to the box.
  test('adds no role or name, and describes no control', async () => {
    const describedBy = () => ['Country', 'Pickup point'].map((name) => screen.getByRole('combobox', { name }).getAttribute('aria-describedby'))
    await mountPlain()
    const without = describedBy()
    TestBed.resetTestingModule()
    document.body.innerHTML = ''

    await mount(() => 'open')

    const parts = [...document.querySelectorAll('[data-formancy-part="field-control-row"], [data-formancy-part="field-beside"]')]
    expect(parts).toHaveLength(4)
    for (const part of parts) {
      expect(part.getAttribute('role')).toBeNull()
      expect(part.getAttribute('aria-label')).toBeNull()
      expect(part.getAttribute('id')).toBeNull()
    }
    expect(describedBy()).toEqual(without)
  })

  // A button beside the box is reached right after it, before the next field: drawn anywhere
  // else in the document, a keyboard would meet it after questions it is not about.
  test('comes after the control in the keyboard’s order', async () => {
    await mount(() => 'open')

    const order = tabbables()
    expect(order.every((element) => element.tabIndex === 0)).toBe(true)
    for (const [control, open] of [
      ['Country', 'Open country'],
      ['Pickup point', 'Open point'],
    ] as const) {
      expect(order[order.indexOf(screen.getByRole('combobox', { name: control })) + 1]).toBe(screen.getByRole('button', { name: open }))
    }
  })

  // The renderer cannot tell a template that draws nothing from one that draws something, so it
  // draws the row; the place beside is left with nothing in it but Angular's anchors, which are
  // comments, so a theme's `:empty` hides it and the box takes the whole row rather than leaving
  // a gap.
  test('is empty, for a theme to hide, where the host’s template draws nothing', async () => {
    await mount(() => 'nothing')

    expect(besides()).toHaveLength(2)
    for (const beside of besides()) expect(beside.matches(':empty')).toBe(true)
  })

  // The template is given the field's own path and its live binding, not a copy taken when the
  // row was drawn: a button beside a lookup that kept the answer it was drawn with would open
  // the record the person had chosen before. And the answer changing redraws the host's content
  // and not the box, which a person is still on.
  test('gives the template the path and the field’s binding', async () => {
    const settle = await mount(() => 'said', { country: 'CH' })
    const box = screen.getByRole('combobox', { name: 'Country' })
    expect(besideOf(screen.getByText('country holds CH'))).toBe(rowOf('country'))
    expect(besideOf(screen.getByText('point holds nothing'))).toBe(rowOf('point'))

    fireEvent.change(box, { target: { value: 'DE' } })
    await settle()

    expect(besideOf(screen.getByText('country holds DE'))).toBe(rowOf('country'))
    expect(screen.getByRole('combobox', { name: 'Country' })).toBe(box)
  })
})
