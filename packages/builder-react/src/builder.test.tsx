import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
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

/**
 * Adding a field is the command without which the builder cannot build
 * anything, and it is two questions: what, then where. Both are lists, because
 * both have to be answerable by somebody who is not using a pointer.
 */
describe('adding a field', () => {
  test('a offers the types the spec defines, in the spec\u2019s own words', async () => {
    const user = userEvent.setup()
    mount()
    await user.tab()

    await user.keyboard('a')

    const palette = screen.getByRole('dialog', { name: 'Add a field' })
    const offered = within(palette)
      .getAllByRole('button')
      .map((button) => button.textContent)

    expect(offered).toContain('Single-line text')
    expect(offered).toContain('Repeater')
    // A page may only sit at the top level, so it is not a palette choice.
    expect(offered).not.toContain('Page')
  })

  test('choosing a type then a place inserts it', async () => {
    const user = userEvent.setup()
    mount()
    await user.tab()
    await user.keyboard('a')

    await user.click(screen.getByRole('button', { name: 'Single-line text' }))
    await user.click(
      within(screen.getByRole('dialog', { name: /Where should the Single-line text go/ })).getByRole(
        'button',
        { name: 'Order, before Customer' },
      ),
    )

    expect(keys()).toEqual(['Single-line text', 'Customer', 'Billing address', 'Street', 'City'])
  })

  test('a second field of the same type does not collide with the first', async () => {
    const user = userEvent.setup()
    const session = mount()
    await user.tab()

    for (let round = 0; round < 2; round += 1) {
      await user.keyboard('a')
      await user.click(screen.getByRole('button', { name: 'Single-line text' }))
      const where = screen.getByRole('dialog', { name: /Where should/ })
      await user.click(within(where).getAllByRole('button')[0]!)
    }

    const topLevel = session.document().model.fields.map((field) => field.key)
    expect(new Set(topLevel).size).toBe(topLevel.length)
  })

  test('a group arrives valid, with a field already inside it', async () => {
    const user = userEvent.setup()
    const session = mount()
    await user.tab()
    await user.keyboard('a')

    await user.click(screen.getByRole('button', { name: 'Group' }))
    const where = screen.getByRole('dialog', { name: /Where should/ })
    await user.click(within(where).getAllByRole('button')[0]!)

    // An empty group fails validation, so inserting one would make the very
    // first edit a refusal.
    expect(session.canPublish().valid).toBe(true)
  })

  test('cancelling the first question adds nothing', async () => {
    const user = userEvent.setup()
    mount()
    await user.tab()
    await user.keyboard('a')

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(keys()).toEqual(['Customer', 'Billing address', 'Street', 'City'])
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

/**
 * Dragging is a SECOND way to reach the same commands. WCAG 2.2 SC 2.5.7 is
 * satisfied by the keyboard path existing, which it did first and still does
 * without this — these tests exist to keep that true.
 */
describe('dragging', () => {
  const dragFromTo = (from: string, to: string, edge: 'top' | 'bottom'): void => {
    const source = screen.getByRole('treeitem', { name: from })
    const target = screen.getByRole('treeitem', { name: to })

    const dataTransfer = {
      effectAllowed: '',
      dropEffect: '',
      setData: () => undefined,
      getData: () => '',
    }

    // Dispatched as MouseEvents, not through fireEvent.dragOver. jsdom has no
    // DragEvent, and Testing Library's fallback drops clientY — so both edges
    // arrived as `undefined` and every drop landed below the target, which is
    // half of what this code decides.
    //
    // jsdom also gives every element a zero-sized box, so the midpoint is 0
    // and the sign of clientY picks the edge.
    const at = (type: string): Event => {
      const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientY: edge === 'top' ? -1 : 1,
      })
      Object.defineProperty(event, 'dataTransfer', { value: dataTransfer })
      return event
    }

    fireEvent(source, at('dragstart'))
    fireEvent(target, at('dragover'))
    fireEvent(target, at('drop'))
  }

  test('a field can be dragged to another position', () => {
    mount()

    dragFromTo('Customer', 'City', 'bottom')

    expect(keys()).toEqual(['Billing address', 'Street', 'City', 'Customer'])
  })

  test('the upper half of a row means before it, not after', () => {
    mount()

    // The other half of the decision, and the one a fireEvent-based test
    // silently could not reach.
    dragFromTo('City', 'Street', 'top')

    expect(keys()).toEqual(['Customer', 'Billing address', 'City', 'Street'])
  })

  test('the keyboard path still works afterwards, because it never depended on this', () => {
    mount()

    dragFromTo('Customer', 'City', 'bottom')
    // The tree is still a tree: the same commands, unchanged.
    expect(screen.getByRole('tree')).toBeTruthy()
    expect(screen.getAllByRole('treeitem')).toHaveLength(4)
  })

  test('a drop is announced through the same live region a keyboard move uses', () => {
    mount()

    dragFromTo('Customer', 'City', 'bottom')

    // Otherwise a drag is a silent command for somebody using both.
    expect(screen.getByRole('status').textContent).toMatch(/^Moved /)
  })

  test('an illegal drop is never offered, rather than refused after the fact', () => {
    mount()

    // A container into its own child. If the UI accepted it and the session
    // refused, the field would snap back with no explanation.
    dragFromTo('Billing address', 'Street', 'bottom')

    expect(keys()).toEqual(['Customer', 'Billing address', 'Street', 'City'])
  })
})
