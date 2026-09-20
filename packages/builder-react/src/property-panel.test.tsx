import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createBuilderSession } from '@formancy/builder-core'
import type { FormSchema } from '@formancy/spec'
import { PropertyPanel } from './property-panel.js'

afterEach(cleanup)

const schema: FormSchema = {
  specVersion: '1',
  id: 'order',
  title: 'Order',
  model: {
    fields: [
      { key: 'email', type: 'text', label: 'Email' },
      { key: 'qty', type: 'number', label: 'Quantity' },
    ],
  },
}

const mountFor = (key: string): ReturnType<typeof createBuilderSession> => {
  const session = createBuilderSession(schema)
  render(<PropertyPanel session={session} keyPath={[key]} />)
  return session
}

const fieldNamed = (key: string, session: ReturnType<typeof createBuilderSession>): Record<string, unknown> =>
  session.document().model.fields.find((f) => f.key === key) as unknown as Record<string, unknown>

describe('the property panel', () => {
  test('offers what the schema says this type has, and nothing it does not', async () => {
    mountFor('email')

    // Text properties, from the schema's own conditionals.
    expect(screen.getByLabelText('Maximum length')).toBeTruthy()
    expect(screen.getByLabelText('Pattern')).toBeTruthy()
    // A number property, which a text field does not have.
    expect(screen.queryByLabelText('Minimum')).toBeNull()
  })

  test('each control carries the description the spec already wrote', async () => {
    mountFor('email')

    const clearOnHide = screen.getByLabelText('Clear when hidden')
    const hintId = clearOnHide.getAttribute('aria-describedby')

    expect(hintId).toBeTruthy()
    expect(document.getElementById(hintId!)?.textContent).toContain('What happens to an answer')
  })

  test('typing into a box sets the property on the document', async () => {
    const user = userEvent.setup()
    const session = mountFor('email')

    // Plain text: user-event reads [ and { as key descriptors.
    await user.type(screen.getByLabelText('Pattern'), 'abc')

    expect(fieldNamed('email', session)['pattern']).toBe('abc')
  })

  test('a checkbox sets a boolean rather than the string "on"', async () => {
    const user = userEvent.setup()
    const session = mountFor('email')

    await user.click(screen.getByLabelText('Required'))

    expect(fieldNamed('email', session)['required']).toBe(true)
  })

  test('a number box sets a number, not a numeric string', async () => {
    const user = userEvent.setup()
    const session = mountFor('qty')

    await user.type(screen.getByLabelText('Minimum'), '3')

    expect(fieldNamed('qty', session)['min']).toBe(3)
  })

  test('clearing a box removes the property instead of storing an empty string', async () => {
    const user = userEvent.setup()
    const session = mountFor('email')
    await user.type(screen.getByLabelText('Pattern'), 'x')
    expect(fieldNamed('email', session)['pattern']).toBe('x')

    await user.clear(screen.getByLabelText('Pattern'))

    // `pattern: ''` is not what the author meant and is not what the schema
    // accepts; absent is.
    expect('pattern' in fieldNamed('email', session)).toBe(false)
  })

  test('a closed list is a select of exactly the values the schema allows', async () => {
    mountFor('email')

    const format = screen.getByLabelText('Format') as HTMLSelectElement
    const values = [...format.options].map((option) => option.value)

    expect(values).toEqual(['', 'email', 'url', 'uuid'])
  })

})

/**
 * The one property the generic renderer cannot handle. Until this existed the
 * panel said so and stopped, which meant a select or radio field could be
 * created by the builder and then not finished in it.
 */
describe('editing a field\u2019s choices', () => {
  const selectSchema: FormSchema = {
    specVersion: '1',
    id: 'order',
    title: 'Order',
    model: {
      fields: [
        {
          key: 'country',
          type: 'select',
          label: 'Country',
          options: [
            { value: 'ch', label: 'Switzerland' },
            { value: 'de', label: 'Germany' },
          ],
        },
      ],
    },
  }

  const mountSelect = (): ReturnType<typeof createBuilderSession> => {
    const session = createBuilderSession(selectSchema)
    render(<PropertyPanel session={session} keyPath={['country']} />)
    return session
  }

  const optionsOf = (session: ReturnType<typeof createBuilderSession>): unknown =>
    (session.document().model.fields[0] as unknown as Record<string, unknown>)['options']

  test('the existing choices are shown as label and stored value', () => {
    mountSelect()

    expect(screen.getAllByLabelText('Choice label').map((input) => (input as HTMLInputElement).value)).toEqual([
      'Switzerland',
      'Germany',
    ])
    expect(
      screen.getAllByLabelText('Stored value').map((input) => (input as HTMLInputElement).value),
    ).toEqual(['ch', 'de'])
  })

  test('rewording a label leaves the stored value alone', async () => {
    const user = userEvent.setup()
    const session = mountSelect()

    await user.clear(screen.getAllByLabelText('Choice label')[0]!)
    await user.type(screen.getAllByLabelText('Choice label')[0]!, 'Schweiz')

    // The label is what a person reads; the value is what is already sitting
    // in every submission. Changing one must not change the other.
    expect(optionsOf(session)).toEqual([
      { value: 'ch', label: 'Schweiz' },
      { value: 'de', label: 'Germany' },
    ])
  })

  test('adding a choice does not collide with a value already in use', async () => {
    const user = userEvent.setup()
    const session = mountSelect()

    await user.click(screen.getByRole('button', { name: 'Add a choice' }))

    const values = (optionsOf(session) as Array<{ value: string }>).map((o) => o.value)
    expect(new Set(values).size).toBe(values.length)
    expect(session.canPublish().valid).toBe(true)
  })

  test('each remove button says what it removes', () => {
    mountSelect()

    // Five identical "remove" buttons are five identical announcements.
    expect(screen.getByRole('button', { name: 'Remove Switzerland' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Remove Germany' })).toBeTruthy()
  })

  test('removing one leaves the rest', async () => {
    const user = userEvent.setup()
    const session = mountSelect()

    await user.click(screen.getByRole('button', { name: 'Remove Switzerland' }))

    expect(optionsOf(session)).toEqual([{ value: 'de', label: 'Germany' }])
  })
})

describe('a choice can be retyped, not only appended to', () => {
  test('clearing a label and typing a new one replaces it', async () => {
    const user = userEvent.setup()
    const session = createBuilderSession({
      specVersion: '1',
      id: 'order',
      title: 'Order',
      model: {
        fields: [
          { key: 'c', type: 'select', label: 'Country', options: [{ value: 'ch', label: 'Switzerland' }] },
        ],
      },
    } as FormSchema)
    render(<PropertyPanel session={session} keyPath={['c']} />)

    await user.clear(screen.getByLabelText('Choice label'))
    await user.type(screen.getByLabelText('Choice label'), 'Schweiz')

    // An empty label is momentarily invalid, so the session refuses it. A
    // purely controlled box snaps back to the old text and the next keystroke
    // appends to it — this produced "SwitzerlandSchweiz".
    const options = (session.document().model.fields[0] as unknown as Record<string, unknown>)['options']
    expect(options).toEqual([{ value: 'ch', label: 'Schweiz' }])
  })
})
