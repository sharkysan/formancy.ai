import { afterEach, describe, expect, test } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
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

/**
 * `span` — a node taking more than one of a table's columns.
 *
 * The report this exists for: a rich text editor and a file dropzone sat in a
 * two-column table in the playground and measured 266px against 548px for a
 * field in the flow. The answer "put the wide thing outside the table" is a
 * workaround with a cost the format cannot pay: a table carries its own
 * `label`, and that label names a real group, so a field placed outside the
 * table is outside that group too.
 */
const spanning: FormSchema = {
  specVersion: '2',
  id: 'address',
  title: 'Address',
  model: {
    fields: [
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
          kind: 'table',
          columns: 2,
          children: [
            { kind: 'field', path: 'postcode' },
            { kind: 'field', path: 'city' },
            { kind: 'field', path: 'notes', span: 'all' },
          ],
        },
      ],
    },
  ],
} as FormSchema

const cellOf = (label: string): HTMLElement | null =>
  screen.getByRole('textbox', { name: label }).closest('[data-formancy-part="layout-cell"]')

describe('a node that spans a table\u2019s columns', () => {
  test('gets a cell to span with, and the others are left exactly as they were', () => {
    // The whole design in one assertion: only the spanning node is wrapped, so a
    // form that uses no span has byte-identical markup to before this existed.
    render(
      <FormancyProvider engine={createFormEngine({ schema: spanning })}>
        <FormancyForm layout="web" onSubmit={() => undefined} />
      </FormancyProvider>,
    )

    expect(cellOf('Notes')?.getAttribute('data-span')).toBe('all')
    expect(cellOf('Postcode')).toBeNull()
    expect(cellOf('City')).toBeNull()

    // And the cell is a child of the table, so it is the grid item the theme sizes.
    const table = document.querySelector('[data-formancy-part="layout-table"]')
    expect(cellOf('Notes')?.parentElement).toBe(table)
  })

  test('carries the number where CSS can count with it, and nothing for `all`', () => {
    // Two channels for one fact, and the reason is arithmetic: a selector can match
    // `data-span`, but `grid-column: span attr(data-span)` is not a thing. `all` is
    // `1 / -1` whatever the column count, so it needs no number at all.
    render(
      <FormancyProvider
        engine={createFormEngine({
          schema: {
            ...spanning,
            layouts: [
              {
                name: 'web',
                nodes: [
                  {
                    kind: 'table',
                    columns: 3,
                    children: [
                      { kind: 'field', path: 'postcode', span: 2 },
                      { kind: 'field', path: 'city' },
                      { kind: 'field', path: 'notes', span: 'all' },
                    ],
                  },
                ],
              },
            ],
          } as FormSchema,
        })}
      >
        <FormancyForm layout="web" onSubmit={() => undefined} />
      </FormancyProvider>,
    )

    expect(cellOf('Postcode')?.style.getPropertyValue('--fm-span')).toBe('2')
    expect(cellOf('Notes')?.style.getPropertyValue('--fm-span')).toBe('')
    expect(cellOf('Notes')?.getAttribute('data-span')).toBe('all')
  })

  test('changes nothing about what any control is called', () => {
    // The line a layout may not cross. A cell is a box around a control, and a box
    // that joined the accessible name would make the arrangement change what the
    // form asks -- which is what 0034 restricts every lookup to role and name for.
    render(
      <FormancyProvider engine={createFormEngine({ schema: spanning })}>
        <FormancyForm layout="web" onSubmit={() => undefined} />
      </FormancyProvider>,
    )

    expect(screen.getByRole('textbox', { name: 'Notes' })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Postcode' })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'City' })).toBeTruthy()
  })
})

/**
 * A layout's own text is translated too, in the locale the engine is in.
 *
 * Reported from the templates gallery: the HR onboarding form chosen in German
 * showed German field labels under the English headings "Employee" and "Work
 * setup". The document was correct — `label: { $t: 'section.1' }`, with the
 * German catalogue carrying that key — and so was `resolveText`. What was wrong
 * is that the layout tree was handed `schema.i18n.defaultLocale` instead of the
 * engine's locale, so **every string that belongs to the arrangement rather
 * than to a field** rendered in the language the form was written in: section
 * headings, group labels, the tab strip's name, a code block's label.
 *
 * Field labels come through the engine and were right, which is what made it
 * survive — a form half in one language reads as a missing translation rather
 * than as a bug, and the missing translation is right there in the file.
 *
 * `engine.locale()` already existed for exactly this class of mistake; its own
 * docblock says it was added because a value computed elsewhere "was a wrong
 * answer whenever a host passed a `locale` of its own". This call site was
 * never moved over.
 */
describe('a layout in a locale that is not the default', () => {
  const translated: FormSchema = {
    specVersion: '1',
    id: 'onboarding',
    title: 'Onboarding',
    model: {
      fields: [
        { key: 'fullName', type: 'text', label: { $t: 'fullName' } },
        { key: 'workMode', type: 'text', label: { $t: 'workMode' } },
      ],
    },
    layouts: [
      {
        name: 'web',
        nodes: [
          { kind: 'section', label: { $t: 'section.1' }, children: [{ kind: 'field', path: 'fullName' }] },
          { kind: 'section', label: { $t: 'section.2' }, children: [{ kind: 'field', path: 'workMode' }] },
        ],
      },
    ],
    i18n: {
      defaultLocale: 'en',
      messages: {
        en: { 'section.1': 'Employee', 'section.2': 'Work setup', fullName: 'Full name', workMode: 'Work arrangement' },
        de: {
          'section.1': 'Mitarbeitende Person',
          'section.2': 'Arbeitsplatz',
          fullName: 'Vor- und Nachname',
          workMode: 'Arbeitsmodell',
        },
      },
    },
  }

  test('names its sections in that locale, not the one the form was written in', () => {
    render(
      <FormancyProvider engine={createFormEngine({ schema: translated, locale: 'de' })}>
        <FormancyForm layout="web" onSubmit={() => undefined} />
      </FormancyProvider>,
    )

    // By role and accessible name, which is the contract a section's heading
    // exists to satisfy: the heading is what names the group.
    expect(screen.getByRole('group', { name: 'Mitarbeitende Person' })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Arbeitsplatz' })).toBeTruthy()

    // And the English is gone rather than merely joined. A heading left in the
    // source language is the whole of the reported defect.
    expect(screen.queryByRole('group', { name: 'Employee' })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Work setup' })).toBeNull()
  })

  test('and still falls back to the default locale for a string that has no translation', () => {
    /*
     * The other half, and the reason this is not simply "use the locale": a
     * catalogue with a gap must show the source language, never the message id.
     * `fr` here has the fields and not the headings.
     */
    const partly: FormSchema = {
      ...translated,
      i18n: {
        defaultLocale: 'en',
        messages: {
          ...translated.i18n!.messages,
          fr: { fullName: 'Prénom et nom', workMode: 'Mode de travail' },
        },
      },
    }

    render(
      <FormancyProvider engine={createFormEngine({ schema: partly, locale: 'fr' })}>
        <FormancyForm layout="web" onSubmit={() => undefined} />
      </FormancyProvider>,
    )

    expect(screen.getByRole('textbox', { name: 'Prénom et nom' })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Employee' }), 'a gap showed the message id').toBeTruthy()
  })
})

/**
 * Tabs on a paged form (0137). The conformance fixture holds both renderers to drawing a
 * paged form's layout a page at a time; a tab strip is the one container that names what
 * it holds before anybody opens it, so it is the one that could still offer a tab over an
 * empty panel — a name for a page somebody is not on.
 */
const pagedTabs: FormSchema = {
  specVersion: '2',
  id: 'paged-tabs',
  title: 'Paged tabs',
  model: {
    fields: [
      { key: 'one', type: 'page', label: 'One', fields: [{ key: 'alpha', type: 'text', label: 'Alpha' }] },
      { key: 'two', type: 'page', label: 'Two', fields: [{ key: 'beta', type: 'text', label: 'Beta' }] },
    ],
  },
  layouts: [
    {
      name: 'web',
      nodes: [
        {
          kind: 'tabs',
          children: [
            { kind: 'section', label: 'First', children: [{ kind: 'field', path: 'alpha' }] },
            { kind: 'section', label: 'Second', children: [{ kind: 'field', path: 'beta' }] },
          ],
        },
      ],
    },
  ],
}

describe('a paged form with tabs', () => {
  test('offers only the tabs with something on the page somebody is on', async () => {
    const engine = createFormEngine({ schema: pagedTabs })
    render(
      <FormancyProvider engine={engine}>
        <FormancyForm layout="web" />
      </FormancyProvider>,
    )
    const tabs = (): string[] => screen.getAllByRole('tab').map((tab) => tab.textContent ?? '')

    expect(tabs()).toEqual(['First'])
    await act(async () => {
      screen.getByRole('button', { name: 'Next' }).click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(tabs()).toEqual(['Second'])
    expect(screen.getByRole('textbox', { name: 'Beta' })).toBeTruthy()
  })
})

describe('a group placed whole', () => {
  /**
   * A layout may place a group's path, and the validator accepts it; both renderers asked
   * the engine for a field there and threw `Unknown field`, so the form did not render at
   * all. It is drawn as its fields, under its label, the way a labelled section is (0151).
   */
  const grouped: FormSchema = {
    specVersion: '4',
    id: 'claim',
    title: 'Claim',
    model: {
      fields: [
        { key: 'name', type: 'text', label: 'Name' },
        {
          key: 'address',
          type: 'group',
          label: 'Address',
          fields: [
            { key: 'street', type: 'text', label: 'Street' },
            { key: 'city', type: 'text', label: 'City' },
          ],
        },
      ],
    },
    layouts: [
      {
        name: 'web',
        nodes: [
          { kind: 'field', path: 'address' },
          { kind: 'field', path: 'name' },
        ],
      },
    ],
  } as FormSchema

  test('is drawn as its fields, in a group named by its label, where the layout puts it', () => {
    render(
      <FormancyProvider engine={createFormEngine({ schema: grouped })}>
        <FormancyForm layout="web" onSubmit={() => undefined} />
      </FormancyProvider>,
    )

    const address = screen.getByRole('group', { name: 'Address' })
    expect(address.contains(screen.getByLabelText('Street'))).toBe(true)
    expect(address.contains(screen.getByLabelText('City'))).toBe(true)
    expect(address.contains(screen.getByLabelText('Name'))).toBe(false)
    expect([...document.querySelectorAll('label')].map((label) => label.textContent)).toEqual([
      'Street',
      'City',
      'Name',
    ])
  })
})
