import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { createFormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { FormancyForm, FormancyProvider, OptionsSourcesProvider, useField } from './index.js'
import type { OptionsSources } from './index.js'

afterEach(cleanup)

/**
 * What a host draws beside a field's control, on the control's own line (0237): a button that
 * opens the record a lookup points to, in Formancy Data. Only a select and a typeahead draw it,
 * the box and the host's content wrapped in one row, and nothing at all where the host gives none.
 *
 * The row and the place beside are read from the DOM by their parts, because they have no role
 * and no name by design: an accessibility tree has nothing to say about them, and a part a theme
 * selects on is what they are for. Everything a person reaches is found by role and name.
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
      // The four controls that draw a fieldset of their own rather than a box.
      { key: 'size', type: 'radio', label: 'Size', options: [{ value: 's', label: 'Small' }] },
      { key: 'extras', type: 'selectboxes', label: 'Extras', options: [{ value: 'tape', label: 'Tape' }] },
      { key: 'rating', type: 'matrix', label: 'Rating', rows: [{ value: 'speed', label: 'Speed' }], options: [{ value: 'good', label: 'Good' }] },
      {
        key: 'order',
        type: 'ranking',
        label: 'Order',
        options: [
          { value: 'fast', label: 'Fast' },
          { value: 'cheap', label: 'Cheap' },
        ],
      },
      // A select in a row, which the host knows by the row's own path.
      {
        key: 'lines',
        type: 'repeater',
        label: 'Lines',
        minItems: 1,
        fields: [{ key: 'parcel', type: 'select', label: 'Parcel', options: [{ value: 'box', label: 'Box' }] }],
      },
    ],
  },
}

const CLOCK = { now: () => 0, today: () => '2026-11-15', random: () => 0.5 }

const mount = (fieldBeside?: (path: string) => ReactNode, schema: FormSchema = form, initialValue?: Record<string, unknown>) =>
  render(
    <FormancyProvider engine={createFormEngine({ schema, capabilities: CLOCK, ...(initialValue === undefined ? {} : { initialValue }) })}>
      <OptionsSourcesProvider value={sources}>
        <FormancyForm {...(fieldBeside === undefined ? {} : { fieldBeside })} />
      </OptionsSourcesProvider>
    </FormancyProvider>,
  )

const open = (path: string) => <button type="button">Open {path}</button>

const wrapperOf = (path: string) => document.querySelector(`[data-formancy-part="field"][data-formancy-field-path="${path}"]`)
const partsOf = (element: Element | null | undefined) =>
  [...(element?.children ?? [])].map((child) => child.getAttribute('data-formancy-part') ?? child.tagName.toLowerCase())
const rowOf = (path: string) => wrapperOf(path)?.querySelector('[data-formancy-part="field-control-row"]')
const besides = () => [...document.querySelectorAll('[data-formancy-part="field-beside"]')]

describe('content beside a field’s control', () => {
  // A host that gives none, or gives nothing for a path, changes no form: not an empty row, and
  // not an attribute, so a form drawn today is drawn the same. Both forms draw their boxes
  // through the row's way of drawing nothing, so the two agreeing would not see that way wrap
  // or reorder the box: the elements each field had before the row existed are named too.
  test('draws nothing where the host gives nothing, so the form is unchanged', () => {
    const { container, unmount } = mount()
    const without = container.innerHTML
    unmount()

    const given = mount(() => null).container.innerHTML

    expect(document.querySelector('[data-formancy-part="field-control-row"]')).toBeNull()
    expect(given).toBe(without)
    expect(partsOf(wrapperOf('country'))).toEqual(['label', 'select', 'select-status'])
    expect(partsOf(wrapperOf('point'))).toEqual(['label', 'typeahead-anchor', 'typeahead-status'])
  })

  // The row holds the box and the host's content and nothing else: a status region or an error
  // inside it would be laid out beside the box, on the control's line, rather than under it.
  test('wraps the select and the host’s content in one row, before the select’s status', async () => {
    mount(open)
    screen.getByRole('button', { name: /submit/i }).click()
    // A failed submit marks the field touched, and its error is drawn once the engine has run.
    await waitFor(() => expect(wrapperOf('country')?.querySelector('[data-formancy-part="error"]')).not.toBeNull())

    const wrapper = wrapperOf('country')
    expect(partsOf(wrapper)).toEqual(['label', 'field-control-row', 'select-status', 'error'])
    expect(partsOf(rowOf('country'))).toEqual(['select', 'field-beside'])
    expect(rowOf('country')?.querySelector('select')).toBe(screen.getByRole('combobox', { name: 'Country' }))
    expect(screen.getByRole('button', { name: 'Open country' }).closest('[data-formancy-part="field-beside"]')?.parentElement).toBe(rowOf('country'))
  })

  // The anchor is the popup's containing block and must wrap the box and its list alone, or the
  // list opens under the row, the host's button included; the status stays a row of the field.
  test('wraps the typeahead’s anchor and not its list or status', () => {
    mount(open)

    const wrapper = wrapperOf('point')
    const anchor = screen.getByRole('combobox', { name: 'Pickup point' }).parentElement
    expect(partsOf(rowOf('point'))).toEqual(['typeahead-anchor', 'field-beside'])
    expect(anchor?.parentElement).toBe(rowOf('point'))
    expect(partsOf(anchor)).toEqual(['typeahead', 'typeahead-listbox'])
    expect(wrapper?.querySelector('[data-formancy-part="typeahead-status"]')?.parentElement).toBe(wrapper)
  })

  // A text field, a fieldset or a select whose source is missing has no single box on a line of
  // its own to join a button to; asked for one, a host would draw content nobody places. Each
  // of the four fieldsets is in the form, so none of them can start asking unseen.
  test('is asked for by the select and the typeahead alone', () => {
    const asked: string[] = []
    mount((path) => {
      asked.push(path)
      return undefined
    })

    // Once per path, in the order the fields are drawn: a source's answer draws the select again.
    expect([...new Set(asked)]).toEqual(['country', 'point', 'lines[0].parcel'])
  })

  // A host keys its content on the path a field's wrapper carries. A row's select asked by its
  // template's path, `lines[].parcel`, would be given the same content in every row, and a
  // button there would open one record from all of them.
  test('is asked for by a row’s select by the row’s own path, and drawn in that row', () => {
    mount((path) => (path === 'lines[0].parcel' ? open(path) : undefined))

    expect(partsOf(rowOf('lines[0].parcel'))).toEqual(['select', 'field-beside'])
    expect(rowOf('lines[0].parcel')?.querySelector('select')).toBe(screen.getByRole('combobox', { name: 'Parcel' }))
    expect(screen.getByRole('button', { name: 'Open lines[0].parcel' }).closest('[data-formancy-part="field-beside"]')?.parentElement).toBe(
      rowOf('lines[0].parcel'),
    )
  })

  // The content is the host's, and reads the field as any host component does: a button that
  // opens the chosen record needs the answer, and nothing else hands it one.
  test('reads the field’s value the way a host component does', () => {
    function Chosen({ path }: { path: string }) {
      const field = useField(path)
      return <span>Chosen: {typeof field.value === 'string' ? field.value : 'nothing'}</span>
    }

    mount((path) => <Chosen path={path} />, form, { country: 'CH', lines: [{ parcel: 'box' }] })

    expect(screen.getByText('Chosen: CH').closest('[data-formancy-part="field-beside"]')?.parentElement).toBe(rowOf('country'))
    expect(screen.getByText('Chosen: nothing').closest('[data-formancy-part="field-beside"]')?.parentElement).toBe(rowOf('point'))
    expect(screen.getByText('Chosen: box').closest('[data-formancy-part="field-beside"]')?.parentElement).toBe(rowOf('lines[0].parcel'))
  })

  // The control is described by its description and its error, as before: a button beside it,
  // flattened into the control's description, would be read out with every visit to the box.
  test('adds no role or name, and describes no control', () => {
    const describedBy = () => ['Country', 'Pickup point'].map((name) => screen.getByRole('combobox', { name }).getAttribute('aria-describedby'))
    const { unmount } = mount()
    const without = describedBy()
    unmount()

    mount(open)

    const parts = [...document.querySelectorAll('[data-formancy-part="field-control-row"], [data-formancy-part="field-beside"]')]
    expect(parts).toHaveLength(6)
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
    const user = userEvent.setup()
    mount(open)

    for (const [control, button] of [
      ['Country', 'Open country'],
      ['Pickup point', 'Open point'],
    ] as const) {
      screen.getByRole('combobox', { name: control }).focus()
      await user.tab()

      expect(document.activeElement).toBe(screen.getByRole('button', { name: button }))
    }
  })

  // The renderer cannot tell a component that draws nothing from one that draws something, so
  // it draws the row; the place beside is left with nothing in it, not even a space, so a
  // theme's `:empty` hides it and the box takes the whole row rather than leaving a gap.
  test('is empty, for a theme to hide, where the host’s component draws nothing', () => {
    function Nothing() {
      return null
    }

    mount(() => <Nothing />)

    expect(besides()).toHaveLength(3)
    for (const beside of besides()) expect(beside.matches(':empty')).toBe(true)
  })

  // A host with something to draw only once the field holds an answer, as a button that opens
  // the chosen record, draws it from inside the place beside: giving content for one answer and
  // none for another would draw the box again each time, and take the keyboard from the person
  // choosing in it.
  test('keeps the box while what the host draws beside it comes and goes', async () => {
    const user = userEvent.setup()
    function OnceChosen({ path }: { path: string }) {
      const field = useField(path)
      return typeof field.value === 'string' ? <button type="button">Open {path}</button> : null
    }
    mount((path) => <OnceChosen path={path} />)
    await screen.findByRole('option', { name: 'Germany' })
    const box = screen.getByRole('combobox', { name: 'Country' })
    box.focus()

    await user.selectOptions(box, 'DE')

    expect(await screen.findByRole('button', { name: 'Open country' })).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Country' })).toBe(box)
    expect(document.activeElement).toBe(box)
  })
})
