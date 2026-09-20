import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { createFormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { FormancyForm } from './form.js'
import { FormancyProvider } from './context.js'

afterEach(cleanup)

const schema: FormSchema = {
  specVersion: '1',
  id: 'address',
  title: 'Address',
  model: {
    fields: [
      { key: 'firstName', type: 'text', label: 'First name' },
      { key: 'lastName', type: 'text', label: 'Last name' },
      { key: 'street', type: 'text', label: 'Street' },
      { key: 'postcode', type: 'text', label: 'Postcode' },
      { key: 'city', type: 'text', label: 'City' },
      { key: 'notes', type: 'textarea', label: 'Notes' },
    ],
  },
  layouts: [
    {
      name: 'web',
      nodes: [
        {
          kind: 'section',
          label: 'Your name',
          children: [
            {
              kind: 'row',
              children: [
                { kind: 'field', path: 'firstName' },
                { kind: 'field', path: 'lastName' },
              ],
            },
          ],
        },
        { kind: 'field', path: 'street' },
        {
          kind: 'row',
          children: [
            { kind: 'field', path: 'postcode' },
            { kind: 'field', path: 'city' },
          ],
        },
      ],
    },
  ],
}

const mount = (layout?: string): void => {
  render(
    <FormancyProvider engine={createFormEngine({ schema })}>
      <FormancyForm {...(layout === undefined ? {} : { layout })} onSubmit={() => undefined} />
    </FormancyProvider>,
  )
}

/** Labels in DOM order — which is reading order and tab order both. */
const labelOrder = (): string[] =>
  [...document.querySelectorAll('label')].map((label) => label.textContent ?? '')

describe('rendering a named layout', () => {
  test('places the fields the layout asks for, in its order', () => {
    mount('web')

    expect(labelOrder()).toEqual(['First name', 'Last name', 'Street', 'Postcode', 'City'])
  })

  test('a field the layout omits is not rendered', () => {
    mount('web')

    // Deliberate: a print layout without the consent checkbox is doing its
    // job. `notes` is in the model and not in this arrangement.
    expect(screen.queryByLabelText('Notes')).toBeNull()
  })

  test('without a layout, model order is unchanged', () => {
    mount()

    expect(labelOrder()).toEqual([
      'First name',
      'Last name',
      'Street',
      'Postcode',
      'City',
      'Notes',
    ])
  })

  test('an unknown layout name falls back to model order rather than an empty form', () => {
    mount('print')

    expect(labelOrder()).toHaveLength(6)
  })
})

/**
 * The criteria that decide how this is built. A side-by-side layout is where
 * DOM order and visual order most easily come apart, and every one of these
 * fails the moment they do.
 */
describe('WCAG', () => {
  test('1.3.2 and 2.4.3 — DOM order is the visual order, so reading and tabbing agree', () => {
    mount('web')

    const row = document.querySelector('[data-formancy-part="layout-row"]')!
    const inRow = [...row.querySelectorAll('label')].map((label) => label.textContent)

    // First name is placed before Last name in the layout, so it is first in
    // the DOM. The stylesheet puts them side by side by source order alone —
    // nothing here or in CSS may reorder them, or a screen reader meets the
    // form in one order and an eye in another.
    expect(inRow).toEqual(['First name', 'Last name'])
  })

  test('1.4.10 — reflow is the stylesheet’s job, so it works before scripts run', () => {
    mount('web')

    const row = document.querySelector('[data-formancy-part="layout-row"]') as HTMLElement

    // No inline width, no measured columns, no ResizeObserver. A layout that
    // reflows only once JavaScript has run is a layout that does not reflow.
    expect(row.getAttribute('style')).toBeNull()
    // The column count is published as data, so CSS can use it without
    // hard-coding how many there are.
    expect(row.getAttribute('data-columns')).toBe('2')
  })

  test('1.3.1 — a labelled section is a real group, announced as one', () => {
    mount('web')

    const group = screen.getByRole('group', { name: 'Your name' })

    // It visibly groups fields under a heading, so it says so programmatically
    // too rather than leaving a sighted-only relationship.
    expect(group.getAttribute('data-formancy-part')).toBe('layout-section')
  })

  test('1.3.1 — a row is presentation and invents no relationship', () => {
    mount('web')

    const rows = document.querySelectorAll('[data-formancy-part="layout-row"]')

    // Two fields being beside each other is not a relationship the author
    // described. Announcing "group" around every pair would be noise.
    for (const row of rows) {
      expect(row.getAttribute('role')).toBeNull()
      expect(row.getAttribute('aria-label')).toBeNull()
    }
  })

  test('an unlabelled section adds no bare group either', () => {
    const unlabelled: FormSchema = {
      ...schema,
      layouts: [
        {
          name: 'web',
          nodes: [{ kind: 'section', children: [{ kind: 'field', path: 'street' }] }],
        },
      ],
    }
    render(
      <FormancyProvider engine={createFormEngine({ schema: unlabelled })}>
        <FormancyForm layout="web" onSubmit={() => undefined} />
      </FormancyProvider>,
    )

    // A group with no accessible name is announced as "group" and tells
    // nobody anything.
    expect(screen.queryByRole('group')).toBeNull()
  })
})

describe('static text', () => {
  const withStatic: FormSchema = {
    specVersion: '1',
    id: 'n',
    title: 'N',
    model: {
      fields: [
        { key: 'notice', type: 'static', label: 'Please answer in block capitals.' },
        { key: 'name', type: 'text', label: 'Name' },
      ],
    },
  }

  test('is shown, because a type the spec defines and nothing renders is a hole', () => {
    render(
      <FormancyProvider engine={createFormEngine({ schema: withStatic })}>
        <FormancyForm onSubmit={() => undefined} />
      </FormancyProvider>,
    )

    expect(screen.getByText('Please answer in block capitals.')).toBeTruthy()
  })

  test('is not a label, because there is no control for it to label', () => {
    render(
      <FormancyProvider engine={createFormEngine({ schema: withStatic })}>
        <FormancyForm onSubmit={() => undefined} />
      </FormancyProvider>,
    )

    // A <label> pointing at nothing is announced as an orphan, and would make
    // the notice look like the name field's caption.
    const labels = [...document.querySelectorAll('label')].map((l) => l.textContent)
    expect(labels).toEqual(['Name'])
  })

  test('collects nothing, so it is absent from the submission', () => {
    const engine = createFormEngine({ schema: withStatic })

    expect(engine.fieldPaths()).toContain('notice')
    expect(engine.validate().valid).toBe(true)
  })
})
