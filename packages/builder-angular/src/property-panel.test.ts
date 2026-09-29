import { provideZonelessChangeDetection } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { afterEach, describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/angular'
import { userEvent } from '@testing-library/user-event'
import { createBuilderSession } from '@formancy/builder-core'
import type { BuilderSession } from '@formancy/builder-core'
import type { FormSchema } from '@formancy/spec'
import { FormancyPropertyPanel } from './property-panel'

/**
 * The property panel, which must behave as the React one does.
 *
 * Generated from the spec's own JSON Schema rather than written out per field
 * type — hand-write twenty-five panels and they rot within two releases — so
 * what these cases really hold is that the generation arrives as real labelled
 * controls with the schema's own words as their hints. A form builder whose own
 * forms are not accessible would be a poor advertisement.
 */
afterEach(() => {
  TestBed.resetTestingModule()
  document.body.innerHTML = ''
})

const schema: FormSchema = {
  specVersion: '3',
  id: 'order',
  title: 'Order',
  model: {
    fields: [
      { key: 'email', type: 'text', label: 'Email' },
      { key: 'qty', type: 'number', label: 'Quantity' },
      {
        key: 'country',
        type: 'select',
        label: 'Country',
        // One choice, because the schema requires at least one: a select with
        // none is a control that offers nothing.
        options: [{ value: 'ch', label: 'Switzerland' }],
      },
    ],
  },
}

interface Mounted {
  session: BuilderSession
  type(element: Element, text: string): Promise<void>
  clear(element: Element): Promise<void>
  click(element: Element): Promise<void>
  select(element: Element, value: string): Promise<void>
}

const mountFor = async (key: string): Promise<Mounted> => {
  const session = createBuilderSession(schema)
  const view = await render(FormancyPropertyPanel, {
    componentInputs: { session, keyPath: [key] },
    providers: [provideZonelessChangeDetection()],
  })
  await view.fixture.whenStable()

  const user = userEvent.setup()
  const settle = async (): Promise<void> => {
    await view.fixture.whenStable()
  }
  return {
    session,
    type: async (element, text) => {
      await user.type(element as HTMLElement, text)
      await settle()
    },
    clear: async (element) => {
      await user.clear(element as HTMLElement)
      await settle()
    },
    click: async (element) => {
      await user.click(element as HTMLElement)
      await settle()
    },
    select: async (element, value) => {
      await user.selectOptions(element as HTMLElement, value)
      await settle()
    },
  }
}

const fieldNamed = (key: string, session: BuilderSession): Record<string, unknown> =>
  session.document().model.fields.find((field) => field.key === key) as unknown as Record<
    string,
    unknown
  >

describe('the property panel', () => {
  test('offers what the schema says this type has, and nothing it does not', async () => {
    await mountFor('email')

    // A text field has a format; a number field does not, and has bounds the
    // text field does not. Derived from the schema rather than listed here.
    expect(screen.getByLabelText(/label/i)).toBeTruthy()
    expect(screen.queryByLabelText(/^minimum$/i)).toBeNull()
    expect(screen.getByLabelText(/format/i)).toBeTruthy()
  })

  test('each control carries the description the spec already wrote', async () => {
    await mountFor('email')

    const box = screen.getByLabelText(/label/i)
    const describedBy = box.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    expect(document.getElementById(describedBy ?? '')?.textContent).toBeTruthy()
  })

  test('typing into a box sets the property on the document', async () => {
    const { session, type } = await mountFor('email')

    await type(screen.getByLabelText(/label/i), 'X')

    expect(String(fieldNamed('email', session)['label'])).toContain('X')
  })

  test('a checkbox sets a boolean rather than the string "on"', async () => {
    const { session, click } = await mountFor('email')

    await click(screen.getByLabelText(/required/i))

    expect(fieldNamed('email', session)['required']).toBe(true)
  })

  test('a number box sets a number, not a numeric string', async () => {
    const { session, type } = await mountFor('qty')

    await type(screen.getByLabelText(/^minimum$/i), '3')

    // `min`, which is what the schema calls it. The title is "Minimum" and the
    // property is not — reading the title and assuming the name is how a panel
    // generated from a schema gets tested against a schema nobody read.
    expect(fieldNamed('qty', session)['min']).toBe(3)
  })

  test('clearing a box removes the property instead of storing an empty string', async () => {
    // `minLength: ''` is not a thing the schema accepts, and a property the
    // author has just cleared should not be in the document at all.
    const { session, type, clear } = await mountFor('email')
    await type(screen.getByLabelText(/label/i), 'Q')

    await clear(screen.getByLabelText(/label/i))

    expect('label' in fieldNamed('email', session)).toBe(false)
  })

  test('a closed list is a select of exactly the values the schema allows', async () => {
    const { session, select } = await mountFor('email')

    const chooser = screen.getByLabelText(/format/i)
    await select(chooser, 'email')

    expect(fieldNamed('email', session)['format']).toBe('email')
  })

  test('a label can be retyped from empty, one letter at a time', async () => {
    // Every intermediate state here is ACCEPTED — a label may be any non-empty
    // string — so this holds the ordinary path and not the draft. The case the
    // draft exists for is in `layout-property-panel.test.ts`, on `span`, because
    // no field property refuses a prefix and a draft tested here would be a
    // guard passing for the wrong reason: written against this case it passed
    // with the draft removed.
    const { session, type, clear } = await mountFor('email')
    await clear(screen.getByLabelText(/label/i))

    await type(screen.getByLabelText(/label/i), 'Full name')

    expect(fieldNamed('email', session)['label']).toBe('Full name')
  })
})

describe('editing a field’s choices', () => {
  /*
   * Everything else in this panel is generated from the JSON Schema, and a list
   * of value/label pairs has no generic rendering that is any good: the schema
   * says "array of objects" and the honest generic answer is a textarea full of
   * JSON.
   *
   * The two columns are not the same kind of thing and the panel says so.
   * `value` is what lands in the submission and is stable identity — changing it
   * orphans every answer already given, exactly as a field key does. `label` is
   * what a person reads and is safe to reword.
   */
  test('offers an editor rather than a box full of JSON', async () => {
    await mountFor('country')

    expect(screen.getByRole('button', { name: /add a choice/i })).toBeTruthy()
    expect(screen.queryByLabelText(/^options$/i)).toBeNull()
  })

  test('adding a choice writes one the document accepts', async () => {
    const { session, click } = await mountFor('country')

    await click(screen.getByRole('button', { name: /add a choice/i }))

    const options = fieldNamed('country', session)['options'] as Array<Record<string, unknown>>
    expect(options).toHaveLength(2)
    expect(typeof options[1]?.['value']).toBe('string')
    expect(options[1]?.['value']).not.toBe('')
  })

  test('rewording a label leaves the stored value alone', async () => {
    // The distinction the two columns exist to make.
    const { session, click, type } = await mountFor('country')
    await click(screen.getByRole('button', { name: /add a choice/i }))
    const before = (fieldNamed('country', session)['options'] as Array<Record<string, unknown>>)[1]?.[
      'value'
    ]

    await type(screen.getAllByLabelText(/label/i).at(-1)!, 'Zurich')

    const options = fieldNamed('country', session)['options'] as Array<Record<string, unknown>>
    expect(options[1]?.['label']).toContain('Zurich')
    expect(options[1]?.['value']).toBe(before)
  })

  test('each remove button says what it removes', async () => {
    // "Remove" three times over is three buttons a screen reader cannot tell
    // apart, on a list where getting the wrong one is losing a choice.
    const { click } = await mountFor('country')
    await click(screen.getByRole('button', { name: /add a choice/i }))

    const removes = screen.getAllByRole('button', { name: /remove/i })
    expect(removes.length).toBeGreaterThan(0)
    for (const button of removes) {
      expect(button.getAttribute('aria-label') ?? button.textContent ?? '').not.toBe('Remove')
    }
  })

  test('removing one leaves the rest', async () => {
    const { session, click } = await mountFor('country')
    await click(screen.getByRole('button', { name: /add a choice/i }))

    await click(screen.getAllByRole('button', { name: /remove/i })[0]!)

    expect(fieldNamed('country', session)['options']).toHaveLength(1)
  })
})

describe('editing a datagrid’s columns', () => {
  /*
   * The other shape generation cannot produce: the schema says "array of
   * objects" and the honest generic answer is a textarea full of JSON.
   *
   * Two things this editor exists to say. A column NAMES a child that already
   * exists, so the answer is a choice and never a text box — a typed name is a
   * column over nothing, refused at publish rather than at the keystroke. And a
   * column list is an ORDERING rather than a choice of which answers to keep, so
   * removing one does not remove the answer.
   */
  const grid: FormSchema = {
    specVersion: '3',
    id: 'order',
    title: 'Order',
    model: {
      fields: [
        {
          key: 'lines',
          type: 'repeater',
          label: 'Lines',
          widget: 'datagrid',
          fields: [
            { key: 'sku', type: 'text', label: 'SKU' },
            { key: 'qty', type: 'number', label: 'Quantity' },
          ],
        },
      ],
    },
  } as unknown as FormSchema

  const onGrid = async (): Promise<Mounted> => {
    const session = createBuilderSession(grid)
    const view = await render(FormancyPropertyPanel, {
      componentInputs: { session, keyPath: ['lines'] },
      providers: [provideZonelessChangeDetection()],
    })
    await view.fixture.whenStable()
    const user = userEvent.setup()
    const settle = async (): Promise<void> => {
      await view.fixture.whenStable()
    }
    return {
      session,
      type: async (element, text) => {
        await user.type(element as HTMLElement, text)
        await settle()
      },
      clear: async (element) => {
        await user.clear(element as HTMLElement)
        await settle()
      },
      click: async (element) => {
        await user.click(element as HTMLElement)
        await settle()
      },
      select: async (element, value) => {
        await user.selectOptions(element as HTMLElement, value)
        await settle()
      },
    }
  }

  test('offers an editor rather than a box of JSON, and says what no column means', async () => {
    await onGrid()

    expect(screen.getByText(/no columns configured/i)).toBeTruthy()
    // Said out loud, because an author who removes a column expects the answer
    // to disappear with it.
    expect(screen.getByText(/every answer still gets one/i)).toBeTruthy()
  })

  test('a column names a child that exists, chosen rather than typed', async () => {
    const { session, click } = await onGrid()

    await click(screen.getByRole('button', { name: /configure the sku column/i }))

    const columns = (
      session.document().model.fields[0] as unknown as Record<string, unknown>
    )['columns'] as Array<Record<string, unknown>>
    expect(columns).toEqual([{ field: 'sku' }])
    // A choice, never a text box: a typed name is a column over nothing.
    expect(screen.getByRole('combobox', { name: /answer/i })).toBeTruthy()
  })

  test('a width is written as a share, and clearing it removes the property', async () => {
    // A length in a document is the format choosing the consumer's design system
    // for them, and no renderer can honour one on a narrow screen.
    const { session, click, type, clear } = await onGrid()
    await click(screen.getByRole('button', { name: /configure the sku column/i }))

    await type(screen.getByRole('spinbutton', { name: /width, as a share/i }), '2')
    let columns = (
      session.document().model.fields[0] as unknown as Record<string, unknown>
    )['columns'] as Array<Record<string, unknown>>
    expect(columns[0]?.['width']).toBe(2)

    await clear(screen.getByRole('spinbutton', { name: /width, as a share/i }))
    columns = (session.document().model.fields[0] as unknown as Record<string, unknown>)[
      'columns'
    ] as Array<Record<string, unknown>>
    // Absent means "an even share"; `width: 0` is refused outright as a column
    // nobody can see.
    expect('width' in (columns[0] ?? {})).toBe(false)
  })

  test('a heading cleared is a column with no heading, not a heading of nothing', async () => {
    /*
     * The one thing this editor genuinely holds by building the column property
     * by property. `width` would be caught anyway — the session copies through
     * JSON and `undefined` does not survive that — but `''` IS a value JSON
     * keeps, so an empty heading would reach the document and mean "a heading
     * that says nothing" rather than "no heading".
     *
     * Measured: writing the naive spread leaves the width case green and this
     * one red, which is why both are here.
     */
    const { session, click, type, clear } = await onGrid()
    await click(screen.getByRole('button', { name: /configure the sku column/i }))

    await type(screen.getByRole('textbox', { name: /short heading/i }), 'Code')
    await clear(screen.getByRole('textbox', { name: /short heading/i }))

    const columns = (
      session.document().model.fields[0] as unknown as Record<string, unknown>
    )['columns'] as Array<Record<string, unknown>>
    expect('header' in (columns[0] ?? {})).toBe(false)
  })

  test('each remove button says which column it removes', async () => {
    const { click } = await onGrid()
    await click(screen.getByRole('button', { name: /configure the sku column/i }))

    expect(screen.getByRole('button', { name: /remove the sku column/i })).toBeTruthy()
  })

  test('and once every answer is named, it says removing one does not remove the answer', async () => {
    const { click } = await onGrid()

    await click(screen.getByRole('button', { name: /configure the sku column/i }))
    await click(screen.getByRole('button', { name: /configure the qty column/i }))

    expect(screen.getByText(/puts its answer back at the end/i)).toBeTruthy()
  })
})
