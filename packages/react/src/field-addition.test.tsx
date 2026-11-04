import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { createFormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { FormancyForm, FormancyProvider, useField } from './index.js'

afterEach(cleanup)

/**
 * What a host draws under a field, inside the paper (0233): a summary of the record a lookup
 * points to and a way to open it, in Formancy Data. It is the host's content in the field's own
 * wrapper, after everything the field says itself, and nothing at all where the host gives none.
 */
const form: FormSchema = {
  specVersion: '5',
  id: 'order',
  title: 'Order',
  model: {
    fields: [
      { key: 'customer', type: 'text', label: 'Customer', description: 'Who it is for.', required: true },
      { key: 'size', type: 'radio', label: 'Size', options: [{ value: 's', label: 'Small' }] },
      { key: 'extras', type: 'selectboxes', label: 'Extras', options: [{ value: 'cheese', label: 'Cheese' }] },
      {
        key: 'rating',
        type: 'matrix',
        label: 'Rating',
        rows: [{ value: 'taste', label: 'Taste' }],
        options: [{ value: 'great', label: 'Great' }],
      },
      {
        key: 'order',
        type: 'ranking',
        label: 'Order',
        options: [
          { value: 'tea', label: 'Tea' },
          { value: 'coffee', label: 'Coffee' },
        ],
      },
      { key: 'secret', type: 'text', label: 'Secret' },
      { key: 'lines', type: 'repeater', label: 'Lines', minItems: 1, fields: [{ key: 'item', type: 'text', label: 'Item' }] },
    ],
  },
  logic: { rules: [{ target: 'secret', kind: 'visible', cel: 'false' }] },
}

const CLOCK = { now: () => 0, today: () => '2026-11-04', random: () => 0.5 }

const mount = (fieldAddition?: (path: string) => ReactNode, schema: FormSchema = form, initialValue?: Record<string, unknown>) =>
  render(
    <FormancyProvider engine={createFormEngine({ schema, capabilities: CLOCK, ...(initialValue === undefined ? {} : { initialValue }) })}>
      <FormancyForm {...(fieldAddition === undefined ? {} : { fieldAddition })} />
    </FormancyProvider>,
  )

const wrapperOf = (path: string) => document.querySelector(`[data-formancy-part="field"][data-formancy-field-path="${path}"]`)
const additions = () => [...document.querySelectorAll('[data-formancy-part="field-addition"]')]

describe('a field addition', () => {
  // A host that gives none, or gives nothing for a path, changes no form: not an empty wrapper,
  // and not an attribute, so a form drawn today is drawn the same.
  test('draws nothing where the host gives nothing, so the form is unchanged', () => {
    const { container, unmount } = mount()
    const without = container.innerHTML
    unmount()

    const given = mount(() => null).container.innerHTML

    expect(additions()).toEqual([])
    expect(given).toBe(without)
  })

  test('is drawn in the field’s own wrapper, after its label, description, control and error', async () => {
    mount((path) => (path === 'customer' ? <a href="#customer-record">Muster AG</a> : undefined))
    screen.getByRole('button', { name: /submit/i }).click()
    // A failed submit marks the field touched, and its error is drawn once the engine has run.
    await waitFor(() => expect(wrapperOf('customer')?.querySelector('[data-formancy-part="error"]')).not.toBeNull())

    const wrapper = wrapperOf('customer')
    const parts = [...(wrapper?.children ?? [])].map((child) => child.getAttribute('data-formancy-part') ?? child.tagName.toLowerCase())

    expect(parts.at(-1)).toBe('field-addition')
    expect(parts).toContain('error')
    expect(additions()).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'Muster AG' }).closest('[data-formancy-part="field-addition"]')?.parentElement).toBe(wrapper)
  })

  // Five shells draw a field: the shared one and four fieldsets. Each places the host's content.
  test.each(['size', 'extras', 'rating', 'order'])('in the fieldset that draws %s too', (path) => {
    mount((asked) => (asked === path ? <span>About {path}</span> : undefined))

    expect(screen.getByText(`About ${path}`).closest('[data-formancy-part="field-addition"]')?.parentElement).toBe(wrapperOf(path))
  })

  // A host keys its content on the path a field's wrapper carries, a row's field among them.
  test('is asked for by each field’s own path, a row’s field and no hidden one among them', () => {
    const asked: string[] = []
    mount((path) => {
      asked.push(path)
      return undefined
    })

    const drawn = [...document.querySelectorAll('[data-formancy-part="field"]')].map((field) => field.getAttribute('data-formancy-field-path'))
    expect(new Set(asked)).toEqual(new Set(drawn))
    expect(asked).not.toContain('secret')
    expect(drawn.some((path) => path?.startsWith('lines') === true && path !== 'lines')).toBe(true)
  })

  // The content is the host's, and reads the field as any host component does.
  test('reads the field’s value the way a host component does', () => {
    function Summary({ path }: { path: string }) {
      const field = useField(path)
      return <span>Chosen: {typeof field.value === 'string' ? field.value : 'nothing'}</span>
    }
    const schema: FormSchema = { ...form, model: { fields: [{ key: 'customer', type: 'text', label: 'Customer' }] }, logic: { rules: [] } }

    mount((path) => <Summary path={path} />, schema, { customer: 'C-17' })

    expect(screen.getByText('Chosen: C-17')).toBeTruthy()
  })

  // The control is described by its description and its error, as before: a summary with a
  // link and a button in it, flattened into the control's description, would be noise.
  test('adds no role or name, and describes no control', () => {
    const describedBy = () => screen.getByRole('textbox', { name: 'Customer' }).getAttribute('aria-describedby')
    const { unmount } = mount()
    const without = describedBy()
    unmount()

    mount((path) => (path === 'customer' ? <button type="button">Open</button> : undefined))

    const addition = additions()[0]
    expect(addition?.getAttribute('role')).toBeNull()
    expect(addition?.getAttribute('aria-label')).toBeNull()
    expect(describedBy()).toBe(without)
    expect(screen.getByRole('button', { name: 'Open' })).toBeTruthy()
  })
})
