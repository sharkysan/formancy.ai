import { afterEach, describe, expect, test } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
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

describe('reporting which field the tree is on', () => {
  test('tells a consumer, so they do not have to read our DOM', async () => {
    // What this replaces: the playground took the focused row's POSITION among its
    // siblings and indexed the flattened node list with it. Right only while those two
    // lists agree about nesting, which they stop doing the moment a container is
    // collapsed — and wrong silently, by editing a different field than the one showing.
    const seen: Array<readonly string[] | null> = []
    const user = userEvent.setup()
    const session = createBuilderSession(schema)
    render(<FormancyBuilder session={session} onSelect={(keyPath) => seen.push(keyPath)} />)

    // The first report is the field the tree starts on, without anybody moving.
    expect(seen.at(-1)).toEqual(['customer'])

    await user.tab()
    await user.keyboard('{ArrowDown}')
    expect(seen.at(-1)).toEqual(['billing'])
  })

  test('reports a key path and not a position, so a reorder cannot point it elsewhere', async () => {
    // Keyed on the path rather than the index: an edit that reorders the list leaves
    // an index pointing at a different field, and would announce a selection nobody
    // made.
    const seen: Array<readonly string[] | null> = []
    const user = userEvent.setup()
    const session = createBuilderSession(schema)
    render(<FormancyBuilder session={session} onSelect={(keyPath) => seen.push(keyPath)} />)

    await user.tab()
    await user.keyboard('{ArrowDown}')
    expect(seen.at(-1)).toEqual(['billing'])

    // Move it to the top: the same field, at a different position. A report keyed on
    // the index would now name `customer`, which nobody selected.
    // Move it to the top. The field is the same field; only its position changed, and
    // focus follows the FIELD. Keyed on the index, this reported `billing.street` --
    // the child that slid into position 1 -- which is a field nobody chose, in a
    // builder whose whole premise is the keyboard.
    act(() => {
      session.moveField(['billing'], { parent: [], index: 0 })
    })
    expect(seen.at(-1)).toEqual(['billing'])
  })
})

describe('making a wizard', () => {
  /*
   * A wizard was the one thing a developer could write by hand and an author
   * could not make: the format has `page`, the engine walks the pages, both
   * renderers draw a stepper, and the builder had no route to one. The palette
   * leaves `page` out deliberately — a page may sit only at the top level, and a
   * palette that can target any container would offer a choice refused most of
   * the time — so it is its own command, on its own key, like move and delete.
   *
   * `p` before any drag surface, because that is the order every command here
   * was built in: WCAG 2.2 SC 2.5.7 wants the keyboard path to be the equal of
   * the pointer one, and a builder that adds it afterwards never quite gets it.
   */
  test('p makes the form a wizard, and says what it did to the fields', async () => {
    const user = userEvent.setup()
    const session = mount()

    await user.tab()
    await user.keyboard('p')

    // The fields that were loose are inside the page now — measured behaviour,
    // not taste: the engine gives a top-level field that is not inside a page to
    // page one wherever it sits, so leaving them out there would draw them in a
    // place they do not render.
    const fields = session.document().model.fields
    expect(fields.map((f) => f.type)).toEqual(['page'])
    expect(fields[0]?.fields?.map((f) => f.key)).toEqual(['customer', 'billing'])

    // And it is announced, because moving every field in the form is not
    // something to do quietly.
    expect(screen.getByRole('status').textContent).toMatch(/2 fields|two fields/i)
  })

  test('a second p adds an empty page rather than absorbing again', async () => {
    const user = userEvent.setup()
    const session = mount()

    await user.tab()
    await user.keyboard('p')
    await user.keyboard('p')

    const fields = session.document().model.fields
    expect(fields.map((f) => f.type)).toEqual(['page', 'page'])
    expect(fields[1]?.fields ?? []).toEqual([])
  })

  test('the page arrives with a label an author can read, not just a key', async () => {
    const user = userEvent.setup()
    const session = mount()

    await user.tab()
    await user.keyboard('p')

    const page = session.document().model.fields[0]
    expect(page?.label).toBe('Page 1')
    // The key is identity and the label is what the stepper shows; renaming the
    // step must not be a key change, so they are set independently.
    expect(page?.key).not.toBe(page?.label)
  })

  test('the tree keeps the keyboard after it, like every other command', async () => {
    const user = userEvent.setup()
    mount()

    await user.tab()
    await user.keyboard('p')

    expect(document.activeElement?.getAttribute('role')).toBe('treeitem')
  })

  test('and the shortcut is listed, so it can be found without being told', () => {
    mount()

    // The legend is how somebody discovers `m` and `Delete`; a command missing
    // from it is a command only its author knows about.
    expect(screen.getByText('p')).toBeTruthy()
  })
})

describe('unmaking a wizard', () => {
  /*
   * The other direction of `p`, and the reason it needed its own key rather than
   * a second press of Delete: Delete takes the container AND everything inside
   * it, so an author who made a wizard by mistake had to delete every question
   * and type them again. `u` takes the container away and keeps the questions.
   *
   * On the tree rather than in a dialog, because there is nothing to choose:
   * where the questions go is decided by where the container stood.
   */
  const paged = (
    ...pages: Array<[string, string, string[]]>
  ): ReturnType<typeof createBuilderSession> => {
    const session = createBuilderSession({
      specVersion: '3',
      id: 'trip',
      title: 'Trip',
      model: {
        fields: pages.map(([key, label, children]) => ({
          key,
          type: 'page',
          label,
          fields: children.map((child) => ({ key: child, type: 'text', label: child })),
        })),
      },
    } as unknown as FormSchema)
    render(<FormancyBuilder session={session} />)
    return session
  }

  test('u on the only page takes it away and leaves the questions where it stood', async () => {
    const user = userEvent.setup()
    const session = paged(['about', 'About you', ['name', 'email']])

    await user.tab()
    await user.keyboard('u')

    expect(session.document().model.fields.map((field) => field.key)).toEqual(['name', 'email'])
  })

  test('and says the form is no longer a wizard, because that is the part worth hearing', async () => {
    // Two questions moving is small. A form ceasing to have steps is not, and it
    // is invisible in a tree that looked like a flat list of questions either way.
    const user = userEvent.setup()
    paged(['about', 'About you', ['name', 'email']])

    await user.tab()
    await user.keyboard('u')

    expect(screen.getByRole('status').textContent).toMatch(/wizard/i)
  })

  test('u on one page of several names the page the questions went to', async () => {
    // The questions do not stay at the top level while other pages remain —
    // hazard D8 — so they are somewhere the author did not choose, and the only
    // thing worse than moving them is moving them quietly.
    const user = userEvent.setup()
    paged(['about', 'About you', ['name']], ['trip', 'Your trip', ['when']])

    await user.tab()
    await user.keyboard('{ArrowDown}{ArrowDown}u')

    expect(screen.getByRole('status').textContent).toMatch(/Your trip/)
  })

  test('u on a field that holds nothing says why, rather than deleting it', async () => {
    const user = userEvent.setup()
    const session = mount()

    await user.tab()
    await user.keyboard('u')

    // `customer` is a text field. The refusal is the session's own sentence,
    // which says unwrapping is not another word for deleting — and the field is
    // still there, which is the half a wrong implementation would get wrong.
    expect(screen.getByRole('status').textContent).toMatch(/nothing inside/i)
    expect(session.document().model.fields.map((field) => field.key)).toEqual([
      'customer',
      'billing',
    ])
  })

  test('the tree keeps the keyboard after it, like every other command', async () => {
    const user = userEvent.setup()
    const session = paged(['about', 'About you', ['name', 'email']])

    await user.tab()
    await user.keyboard('u')

    // The command is asserted as well as the focus, because focus on a treeitem
    // is also what a key that does NOTHING leaves behind: written without this
    // line the case passed before the command existed.
    expect(session.document().model.fields).toHaveLength(2)
    expect(document.activeElement?.getAttribute('role')).toBe('treeitem')
  })

  test('and the shortcut is listed, so it can be found without being told', () => {
    mount()

    // Every other command in this tree is discoverable from the legend. One that
    // is not is a command only its author knows about — which is how `p` would
    // have shipped.
    expect(screen.getByText('u')).toBeTruthy()
  })
})

describe('and what it says when the page was empty', () => {
  /*
   * Both of these were found in the built playground rather than here: press `p`
   * twice, which makes page one out of the form and page two empty, then press
   * `u` on page two. It said *"Removed the page Page 2 and kept its 0 questions.
   * The form is not a wizard any more."* — nonsense in the first sentence and
   * FALSE in the second, because page one was still there.
   *
   * The cause of the false half is worth recording: the announcement worked out
   * whether the form was still a wizard by looking for the page that now held the
   * first question, and an empty page has no first question. Absence of a host
   * read as absence of pages. It is decided by counting the pages now.
   */
  const twoPages = (): ReturnType<typeof createBuilderSession> => {
    const session = createBuilderSession({
      specVersion: '3',
      id: 'trip',
      title: 'Trip',
      model: {
        fields: [
          {
            key: 'one',
            type: 'page',
            label: 'Page 1',
            fields: [{ key: 'name', type: 'text', label: 'Name' }],
          },
          { key: 'two', type: 'page', label: 'Page 2', fields: [] },
        ],
      },
    } as unknown as FormSchema)
    render(<FormancyBuilder session={session} />)
    return session
  }

  test('an empty page is removed without a count of what it kept', async () => {
    const user = userEvent.setup()
    twoPages()

    await user.tab()
    await user.keyboard('{ArrowDown}{ArrowDown}u')

    const said = screen.getByRole('status').textContent ?? ''
    expect(said).toMatch(/empty/i)
    expect(said).not.toMatch(/0 questions/)
  })

  test('and it does not claim the form stopped being a wizard while a page remains', async () => {
    // The half that was actually wrong rather than merely clumsy. A false
    // statement in a live region is worse than a missing one: nothing on screen
    // contradicts it, because a tree of questions looks the same either way.
    const user = userEvent.setup()
    const session = twoPages()

    await user.tab()
    await user.keyboard('{ArrowDown}{ArrowDown}u')

    expect(screen.getByRole('status').textContent).not.toMatch(/not a wizard/i)
    expect(session.document().model.fields.map((field) => field.type)).toEqual(['page'])
  })

  test('and says it when the last page goes, empty or not', async () => {
    // The other side of the same discriminator: an empty page that was the ONLY
    // page does end the wizard, and a rule written to fix the sentence above must
    // not have stopped saying so.
    const user = userEvent.setup()
    const session = createBuilderSession({
      specVersion: '3',
      id: 'trip',
      title: 'Trip',
      model: { fields: [{ key: 'one', type: 'page', label: 'Page 1', fields: [] }] },
    } as unknown as FormSchema)
    render(<FormancyBuilder session={session} />)

    await user.tab()
    await user.keyboard('u')

    expect(screen.getByRole('status').textContent).toMatch(/not a wizard/i)
    expect(session.document().model.fields).toEqual([])
  })
})
