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
  // not an attribute, so a form drawn today is drawn the same.
  test('draws nothing where the host gives nothing, so the form is unchanged', () => {
    const { container, unmount } = mount()
    const without = container.innerHTML
    unmount()

    const given = mount(() => null).container.innerHTML

    expect(document.querySelector('[data-formancy-part="field-control-row"]')).toBeNull()
    expect(given).toBe(without)
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
  // its own to join a button to; asked for one, a host would draw content nobody places.
  test('is asked for by the select and the typeahead alone', () => {
    const asked: string[] = []
    mount((path) => {
      asked.push(path)
      return undefined
    })

    // Once per path, in the order the fields are drawn: a source's answer draws the select again.
    expect([...new Set(asked)]).toEqual(['country', 'point'])
  })

  // The content is the host's, and reads the field as any host component does: a button that
  // opens the chosen record needs the answer, and nothing else hands it one.
  test('reads the field’s value the way a host component does', () => {
    function Chosen({ path }: { path: string }) {
      const field = useField(path)
      return <span>Chosen: {typeof field.value === 'string' ? field.value : 'nothing'}</span>
    }

    mount((path) => <Chosen path={path} />, form, { country: 'CH' })

    expect(screen.getByText('Chosen: CH').closest('[data-formancy-part="field-beside"]')?.parentElement).toBe(rowOf('country'))
    expect(screen.getByText('Chosen: nothing').closest('[data-formancy-part="field-beside"]')?.parentElement).toBe(rowOf('point'))
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
    const user = userEvent.setup()
    mount(open)

    screen.getByRole('combobox', { name: 'Country' }).focus()
    await user.tab()

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Open country' }))
  })

  // The renderer cannot tell a component that draws nothing from one that draws something, so
  // it draws the row; the place beside is left with nothing in it, not even a space, so a
  // theme's `:empty` hides it and the box takes the whole row rather than leaving a gap.
  test('is empty, for a theme to hide, where the host’s component draws nothing', () => {
    function Nothing() {
      return null
    }

    mount(() => <Nothing />)

    expect(besides()).toHaveLength(2)
    for (const beside of besides()) expect(beside.matches(':empty')).toBe(true)
  })
})
