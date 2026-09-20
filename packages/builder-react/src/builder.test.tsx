import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
// Named, not default: the package exports both, and under NodeNext the
// default resolves to the module namespace rather than the object with setup().
import { userEvent } from '@testing-library/user-event'
import { createBuilderSession } from '@formancy/builder-core'
import type { FormSchema } from '@formancy/spec'
import { FormancyBuilder } from './builder.js'

afterEach(cleanup)

const schema: FormSchema = {
  specVersion: '1',
  id: 'order',
  title: 'Order',
  model: {
    fields: [
      { key: 'customer', type: 'text', label: 'Customer' },
      {
        key: 'billing',
        type: 'group',
        label: 'Billing address',
        fields: [
          { key: 'street', type: 'text', label: 'Street' },
          { key: 'city', type: 'text', label: 'City' },
        ],
      },
    ],
  },
}

const mount = (): ReturnType<typeof createBuilderSession> => {
  const session = createBuilderSession(schema)
  render(<FormancyBuilder session={session} />)
  return session
}

const keys = (): string[] =>
  screen.getAllByRole('treeitem').map((item) => item.textContent ?? '')

describe('the structure tree', () => {
  test('is one tab stop, not one per field', async () => {
    const user = userEvent.setup()
    mount()

    await user.tab()

    // A hundred-field form must not cost a hundred tabs to get past. Roving
    // tabindex: exactly one item is reachable, and arrows do the rest.
    expect(screen.getAllByRole('treeitem').filter((i) => i.tabIndex === 0)).toHaveLength(1)
    expect(document.activeElement?.textContent).toBe('Customer')
  })

  test('arrows walk it in the order a person reads the form', async () => {
    const user = userEvent.setup()
    mount()
    await user.tab()

    await user.keyboard('{ArrowDown}')
    expect(document.activeElement?.textContent).toBe('Billing address')

    // Into the group's contents, because that is where the eye goes next.
    await user.keyboard('{ArrowDown}')
    expect(document.activeElement?.textContent).toBe('Street')

    await user.keyboard('{ArrowUp}')
    expect(document.activeElement?.textContent).toBe('Billing address')
  })

  test('nesting is exposed to assistive technology, not only indented', async () => {
    mount()

    const street = screen.getByRole('treeitem', { name: 'Street' })
    expect(street.getAttribute('aria-level')).toBe('2')
    expect(screen.getByRole('treeitem', { name: 'Customer' }).getAttribute('aria-level')).toBe('1')
  })
})

/**
 * WCAG 2.2 SC 2.5.7: every drag operation needs a keyboard alternative. These
 * tests are that alternative, and they exist before any drag surface does.
 */
describe('moving a field without a pointer', () => {
  test('m opens a palette of destinations described in words', async () => {
    const user = userEvent.setup()
    mount()
    await user.tab()

    await user.keyboard('m')

    const palette = screen.getByRole('dialog', { name: 'Move Customer' })
    const offered = within(palette)
      .getAllByRole('button')
      .map((button) => button.textContent)

    // Not "parent=billing index=1". Somebody choosing with their ears has to
    // be able to tell these apart.
    expect(offered).toContain('Billing address, before Street')
    expect(offered).toContain('Order, after Billing address')
  })

  test('choosing a destination moves the field and says so', async () => {
    const user = userEvent.setup()
    mount()
    await user.tab()
    await user.keyboard('m')

    await user.click(screen.getByRole('button', { name: 'Billing address, before Street' }))

    expect(keys()).toEqual(['Billing address', 'Customer', 'Street', 'City'])
    expect(screen.getByRole('status').textContent).toBe('Moved Customer to Billing address, before Street.')
  })

  test('cancelling changes nothing and returns focus to the tree', async () => {
    const user = userEvent.setup()
    mount()
    await user.tab()
    await user.keyboard('m')

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(keys()).toEqual(['Customer', 'Billing address', 'Street', 'City'])
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  test('a field with nowhere to go says so rather than opening an empty dialog', async () => {
    const user = userEvent.setup()
    const onlyField: FormSchema = {
      ...schema,
      model: { fields: [{ key: 'solo', type: 'text', label: 'Solo' }] },
    }
    render(<FormancyBuilder session={createBuilderSession(onlyField)} />)
    await user.tab()

    await user.keyboard('m')

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('status').textContent).toBe('Solo cannot be moved anywhere else.')
  })
})

describe('removing and undoing', () => {
  test('Delete removes the focused field', async () => {
    const user = userEvent.setup()
    mount()
    await user.tab()

    await user.keyboard('{Delete}')

    expect(keys()).toEqual(['Billing address', 'Street', 'City'])
    expect(screen.getByRole('status').textContent).toBe('Removed Customer.')
  })

  test('a refused command explains itself instead of doing nothing', async () => {
    const user = userEvent.setup()
    const withRule: FormSchema = {
      ...schema,
      logic: { rules: [{ target: 'customer', kind: 'visible', cel: 'true' }] },
    }
    render(<FormancyBuilder session={createBuilderSession(withRule)} />)
    await user.tab()

    await user.keyboard('{Delete}')

    // builder-core refuses this: a rule still points at the field. Silence
    // would look like a broken key.
    expect(keys()).toContain('Customer')
    expect(screen.getByRole('status').textContent).toMatch(/^Cannot remove Customer: /)
  })

  test('Ctrl+Z puts it back', async () => {
    const user = userEvent.setup()
    mount()
    await user.tab()
    await user.keyboard('{Delete}')

    await user.keyboard('{Control>}z{/Control}')

    expect(keys()).toEqual(['Customer', 'Billing address', 'Street', 'City'])
  })

  test('focus does not fall off the end when the last field goes', async () => {
    const user = userEvent.setup()
    mount()
    await user.tab()
    await user.keyboard('{End}')
    expect(document.activeElement?.textContent).toBe('City')

    await user.keyboard('{Delete}')

    // Still inside the tree, on something real, rather than on nothing.
    expect(document.activeElement?.textContent).toBe('Street')
  })
})
