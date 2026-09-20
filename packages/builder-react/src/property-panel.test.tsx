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

  test('options say they are not editable here rather than rendering as JSON', () => {
    const withSelect: FormSchema = {
      ...schema,
      model: { fields: [{ key: 'country', type: 'select', label: 'Country' }] },
    }
    const session = createBuilderSession(withSelect)
    render(<PropertyPanel session={session} keyPath={['country']} />)

    expect(screen.getByText(/Options is not editable here yet/)).toBeTruthy()
  })
})
