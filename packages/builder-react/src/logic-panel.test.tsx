import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createBuilderSession } from '@formancy/builder-core'
import type { FormSchema, LogicRule } from '@formancy/spec'
import { LogicPanel } from './logic-panel.js'

afterEach(cleanup)

const schema: FormSchema = {
  specVersion: '1',
  id: 'order',
  title: 'Order',
  model: {
    fields: [
      { key: 'country', type: 'text', label: 'Country' },
      { key: 'canton', type: 'text', label: 'Canton' },
      { key: 'qty', type: 'number', label: 'Quantity' },
    ],
  },
}

const mount = (
  initial: FormSchema = schema,
): ReturnType<typeof createBuilderSession> => {
  const session = createBuilderSession(initial)
  render(<LogicPanel session={session} keyPath={['canton']} />)
  return session
}

const rulesOf = (session: ReturnType<typeof createBuilderSession>): LogicRule[] =>
  session.document().logic?.rules ?? []

describe('authoring a rule', () => {
  test('a field with none says so plainly', () => {
    mount()

    expect(screen.getByText('This field always behaves the same way.')).toBeTruthy()
  })

  test('the expression is previewed before the rule is added', async () => {
    const user = userEvent.setup()
    mount()
    await user.click(screen.getByRole('button', { name: 'Add a rule' }))

    await user.selectOptions(screen.getByLabelText('Field'), 'country')
    await user.type(screen.getByLabelText('Value'), 'CH')

    // Somebody who can read CEL should be able to check the condition means
    // what they chose, before committing to it.
    expect(screen.getByText('country == "CH"')).toBeTruthy()
  })

  test('adding it writes CEL, and keeps the condition as editor metadata', async () => {
    const user = userEvent.setup()
    const session = mount()
    await user.click(screen.getByRole('button', { name: 'Add a rule' }))

    await user.selectOptions(screen.getByLabelText('Field'), 'country')
    await user.type(screen.getByLabelText('Value'), 'CH')
    await user.click(screen.getByRole('button', { name: 'Add rule' }))

    expect(rulesOf(session)).toEqual([
      {
        target: 'canton',
        kind: 'visible',
        cel: 'country == "CH"',
        // Never evaluated — it exists so the panel can reopen the condition
        // rather than parse CEL back. CEL stays the single source of truth.
        editor: { field: 'country', operator: 'is', value: 'CH' },
      },
    ])
  })

  test('a number typed into the box compares as a number', async () => {
    const user = userEvent.setup()
    const session = mount()
    await user.click(screen.getByRole('button', { name: 'Add a rule' }))

    await user.selectOptions(screen.getByLabelText('Field'), 'qty')
    await user.selectOptions(screen.getByLabelText('Comparison'), 'isMoreThan')
    await user.type(screen.getByLabelText('Value'), '5')
    await user.click(screen.getByRole('button', { name: 'Add rule' }))

    // `qty > "5"` would be a type error CEL catches at save time. The double
    // is what makes it compile against a number field.
    expect(rulesOf(session)[0]?.cel).toBe('qty > 5.0')
  })

  test('a comparison that needs no value hides the box', async () => {
    const user = userEvent.setup()
    mount()
    await user.click(screen.getByRole('button', { name: 'Add a rule' }))

    await user.selectOptions(screen.getByLabelText('Comparison'), 'isAnswered')

    expect(screen.queryByLabelText('Value')).toBeNull()
    expect(screen.getByText('country != null')).toBeTruthy()
  })

  test('the rule the builder writes is one the engine accepts', async () => {
    const user = userEvent.setup()
    const session = mount()
    await user.click(screen.getByRole('button', { name: 'Add a rule' }))
    await user.selectOptions(screen.getByLabelText('Field'), 'country')
    await user.type(screen.getByLabelText('Value'), 'CH')

    await user.click(screen.getByRole('button', { name: 'Add rule' }))

    // builder-core commits only what validateSchema accepts, so a refused rule
    // would leave the document unchanged — and canPublish is the same verdict
    // the server will reach.
    expect(rulesOf(session)).toHaveLength(1)
    expect(session.canPublish().valid).toBe(true)
  })

  test('cancelling adds nothing', async () => {
    const user = userEvent.setup()
    const session = mount()
    await user.click(screen.getByRole('button', { name: 'Add a rule' }))

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(rulesOf(session)).toEqual([])
  })
})

describe('existing rules', () => {
  const withRule: FormSchema = {
    ...schema,
    logic: { rules: [{ target: 'canton', kind: 'visible', cel: 'country == "CH"' }] },
  }

  test('are listed with the expression they compiled to', () => {
    mount(withRule)

    expect(screen.getByText('Show this field when')).toBeTruthy()
    expect(screen.getByText('country == "CH"')).toBeTruthy()
  })

  test('each remove button says which rule it removes', () => {
    mount(withRule)

    expect(screen.getByRole('button', { name: 'Remove the visible rule on canton' })).toBeTruthy()
  })

  test('removing one takes it out of the document', async () => {
    const user = userEvent.setup()
    const session = mount(withRule)

    await user.click(screen.getByRole('button', { name: 'Remove the visible rule on canton' }))

    expect(rulesOf(session)).toEqual([])
  })

  test('only this field’s rules are shown', () => {
    mount({
      ...schema,
      logic: {
        rules: [
          { target: 'canton', kind: 'visible', cel: 'country == "CH"' },
          { target: 'qty', kind: 'required', cel: 'country == "DE"' },
        ],
      },
    })

    expect(screen.getAllByRole('listitem')).toHaveLength(1)
  })
})
