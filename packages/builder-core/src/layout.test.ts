import { describe, expect, test } from 'vitest'
import { createBuilderSession } from './session.js'
import type { FormSchema, LayoutNode } from '@formancy/spec'

/**
 * Editing the arrangement, which is a different document from the model.
 *
 * A layout node has no key — it is addressed by its position, and every edit
 * renumbers the positions after it. That is the whole difficulty here, and it
 * is why these tests are mostly about what an index means after something has
 * moved.
 */
const base = (): FormSchema => ({
  specVersion: '1',
  id: 'arranged',
  title: 'An arranged form',
  model: {
    fields: [
      { key: 'first', type: 'text', label: 'First name' },
      { key: 'last', type: 'text', label: 'Last name' },
      { key: 'email', type: 'text', label: 'Email' },
    ],
  },
  layouts: [
    {
      name: 'web',
      nodes: [
        { kind: 'row', children: [{ kind: 'field', path: 'first' }, { kind: 'field', path: 'last' }] },
        { kind: 'field', path: 'email' },
      ],
    },
  ],
})

const row = (): LayoutNode => ({ kind: 'row', children: [] })

const layoutOf = (document: FormSchema, name = 'web'): LayoutNode[] =>
  document.layouts?.find((layout) => layout.name === name)?.nodes ?? []

describe('insertLayoutNode', () => {
  test('puts an empty row at the top level', () => {
    const session = createBuilderSession(base())

    const outcome = session.insertLayoutNode({ layout: 'web', parent: [], index: 0 }, row())

    expect(outcome.ok).toBe(true)
    expect(layoutOf(session.document())[0]?.kind).toBe('row')
  })

  test('puts a field inside a row', () => {
    const session = createBuilderSession({
      ...base(),
      layouts: [{ name: 'web', nodes: [{ kind: 'row', children: [] }] }],
    })

    session.insertLayoutNode({ layout: 'web', parent: [0], index: 0 }, { kind: 'field', path: 'first' })

    const first = layoutOf(session.document())[0]
    expect(first?.kind === 'row' ? first.children : []).toEqual([{ kind: 'field', path: 'first' }])
  })

  test('refuses a field that is already placed, in the validator’s own words', () => {
    const session = createBuilderSession(base())

    const outcome = session.insertLayoutNode(
      { layout: 'web', parent: [], index: 0 },
      { kind: 'field', path: 'email' },
    )

    expect(outcome.ok).toBe(false)
    // A field placed twice renders twice, bound to one answer. The message has
    // to come from the validator so the builder cannot disagree with publish.
    expect(outcome.ok === false ? outcome.message : '').toContain('already placed')
  })

  test('refuses a field that does not exist', () => {
    const session = createBuilderSession(base())

    expect(
      session.insertLayoutNode({ layout: 'web', parent: [], index: 0 }, { kind: 'field', path: 'nope' }).ok,
    ).toBe(false)
  })

  test('refuses a layout nobody has created', () => {
    const session = createBuilderSession(base())

    expect(session.insertLayoutNode({ layout: 'print', parent: [], index: 0 }, row()).ok).toBe(false)
  })

  test('an index past the end lands at the end rather than failing', () => {
    const session = createBuilderSession(base())

    session.insertLayoutNode({ layout: 'web', parent: [], index: 99 }, row())

    expect(layoutOf(session.document())).toHaveLength(3)
    expect(layoutOf(session.document())[2]?.kind).toBe('row')
  })
})

describe('moveLayoutNode', () => {
  test('moves a field out of a row to the top level', () => {
    const session = createBuilderSession(base())

    const outcome = session.moveLayoutNode(
      { layout: 'web', path: [0, 1] },
      { layout: 'web', parent: [], index: 0 },
    )

    expect(outcome.ok).toBe(true)
    const nodes = layoutOf(session.document())
    expect(nodes[0]).toEqual({ kind: 'field', path: 'last' })
    const movedFrom = nodes[1]
    expect(movedFrom?.kind === 'row' ? movedFrom.children : []).toEqual([
      { kind: 'field', path: 'first' },
    ])
  })

  test('an index in the destination counts positions AFTER the node is lifted out', () => {
    const session = createBuilderSession(base())

    // Moving the row (index 0) to index 1 of the same container. Once it is
    // lifted out there is one node left, so index 1 is the end — and the row
    // ends up after the email field, which is what a person pointing there
    // meant. Counting against the list as it stands would be off by one.
    session.moveLayoutNode({ layout: 'web', path: [0] }, { layout: 'web', parent: [], index: 1 })

    const nodes = layoutOf(session.document())
    expect(nodes[0]).toEqual({ kind: 'field', path: 'email' })
    expect(nodes[1]?.kind).toBe('row')
  })

  test('the destination container is addressed as the caller sees it, not after the lift', () => {
    // Three siblings: field, row, field. Moving the first INTO the row.
    // The caller says parent [1] — where the row is right now — and the index
    // counts after the lift. Applying the lift correction to the parent as
    // well, as an early version did in two places at once, landed the field in
    // a neighbouring container and left a valid document behind.
    const session = createBuilderSession({
      ...base(),
      layouts: [
        {
          name: 'web',
          nodes: [
            { kind: 'field', path: 'email' },
            { kind: 'row', children: [{ kind: 'field', path: 'first' }] },
            { kind: 'field', path: 'last' },
          ],
        },
      ],
    })

    const outcome = session.moveLayoutNode(
      { layout: 'web', path: [0] },
      { layout: 'web', parent: [1], index: 0 },
    )

    expect(outcome.ok).toBe(true)
    expect(layoutOf(session.document())).toEqual([
      {
        kind: 'row',
        children: [
          { kind: 'field', path: 'email' },
          { kind: 'field', path: 'first' },
        ],
      },
      { kind: 'field', path: 'last' },
    ])
  })

  test('refuses to move a container into its own child', () => {
    const session = createBuilderSession(base())

    const outcome = session.moveLayoutNode(
      { layout: 'web', path: [0] },
      { layout: 'web', parent: [0], index: 0 },
    )

    expect(outcome.ok).toBe(false)
    expect(outcome.ok === false ? outcome.message : '').toContain('inside itself')
  })

  test('refuses an address that points at nothing', () => {
    const session = createBuilderSession(base())

    expect(
      session.moveLayoutNode({ layout: 'web', path: [7] }, { layout: 'web', parent: [], index: 0 }).ok,
    ).toBe(false)
  })

  test('refuses a move between layouts', () => {
    const session = createBuilderSession(base())
    session.addLayout('print')

    // A field has one place per arrangement. Moving it across would silently
    // unplace it in the layout it came from, which is a deletion wearing the
    // word "move".
    const outcome = session.moveLayoutNode(
      { layout: 'web', path: [1] },
      { layout: 'print', parent: [], index: 0 },
    )

    expect(outcome.ok).toBe(false)
  })
})

describe('removeLayoutNode', () => {
  test('takes the subtree with it', () => {
    const session = createBuilderSession(base())

    session.removeLayoutNode({ layout: 'web', path: [0] })

    expect(layoutOf(session.document())).toEqual([{ kind: 'field', path: 'email' }])
  })

  test('unplacing a field is legal — a layout need not place everything', () => {
    const session = createBuilderSession(base())

    expect(session.removeLayoutNode({ layout: 'web', path: [1] }).ok).toBe(true)
  })
})

describe('unwrapLayoutNode', () => {
  test('replaces a container with its children, in order, where it stood', () => {
    const session = createBuilderSession(base())

    const outcome = session.unwrapLayoutNode({ layout: 'web', path: [0] })

    expect(outcome.ok).toBe(true)
    expect(layoutOf(session.document())).toEqual([
      { kind: 'field', path: 'first' },
      { kind: 'field', path: 'last' },
      { kind: 'field', path: 'email' },
    ])
  })

  test('refuses on a field, which has no children to put anywhere', () => {
    const session = createBuilderSession(base())

    expect(session.unwrapLayoutNode({ layout: 'web', path: [1] }).ok).toBe(false)
  })
})

describe('wrapLayoutNodes', () => {
  /**
   * The inverse of `unwrapLayoutNode`, and the command behind "drop this field
   * beside that one to make a row".
   *
   * Dragging a field onto another field's SIDE is the gesture a builder is
   * expected to have and this one did not: you had to add a row, then move two
   * fields into it — three steps and three undos for one intention.
   *
   * It takes several addresses rather than one because the gesture needs two,
   * and it does NOT require them to be siblings: the field being dragged is
   * usually somewhere else entirely. That is also what makes it one command and
   * therefore one undo, which matters more than the API being minimal — a
   * gesture that takes three presses of undo to reverse is one people stop
   * trusting.
   */
  test('wraps two top-level fields in a row where the first one stood', () => {
    const session = createBuilderSession(base())

    const outcome = session.wrapLayoutNodes('web', [[1], [0]], row())

    expect(outcome.ok).toBe(true)
    // Order follows the addresses given, not the document: the drop side is
    // what decides which field ends up on the left.
    expect(layoutOf(session.document())).toEqual([
      {
        kind: 'row',
        children: [
          { kind: 'field', path: 'email' },
          { kind: 'row', children: [{ kind: 'field', path: 'first' }, { kind: 'field', path: 'last' }] },
        ],
      },
    ])
  })

  test('puts the new container where the earliest node stood', () => {
    const session = createBuilderSession(base())

    // Given out of order, so this pins the position rather than the argument
    // order: the row belongs where the topmost of them was.
    session.wrapLayoutNodes('web', [[1], [0]], row())

    expect(layoutOf(session.document()).length).toBe(1)
  })

  test('takes nodes out of different containers', () => {
    const session = createBuilderSession(base())

    // `first` is inside the row at [0]; `email` is at top level.
    const outcome = session.wrapLayoutNodes('web', [[0, 0], [1]], row())

    expect(outcome.ok).toBe(true)

    // The new row lands where the EARLIEST address stood, and [0, 0] stood
    // inside the existing row — so the wrapper goes in there, beside `last`,
    // rather than at the top level. Worth pinning, because the first version of
    // this expectation assumed the top level and the implementation was right:
    // "where the earliest node stood" means its container as well as its index.
    expect(layoutOf(session.document())).toEqual([
      {
        kind: 'row',
        children: [
          {
            kind: 'row',
            children: [{ kind: 'field', path: 'first' }, { kind: 'field', path: 'email' }],
          },
          { kind: 'field', path: 'last' },
        ],
      },
    ])
  })

  test('is one undo, not one per node moved', () => {
    const session = createBuilderSession(base())
    const before = layoutOf(session.document())

    session.wrapLayoutNodes('web', [[0], [1]], row())
    expect(session.undo()).toBe(true)

    // A gesture that takes three undos to reverse is one people stop trusting.
    expect(layoutOf(session.document())).toEqual(before)
  })

  test('takes the position of whichever address is named, not the earliest', () => {
    const session = createBuilderSession(base())

    // `first` is inside the row at [0]; `email` is at top level. Naming email's
    // address puts the new row where EMAIL was, at the top level.
    const outcome = session.wrapLayoutNodes('web', [[0, 0], [1]], row(), [1])

    expect(outcome.ok).toBe(true)
    expect(layoutOf(session.document())).toEqual([
      { kind: 'row', children: [{ kind: 'field', path: 'last' }] },
      {
        kind: 'row',
        children: [{ kind: 'field', path: 'first' }, { kind: 'field', path: 'email' }],
      },
    ])
  })

  test('the position is independent of the child order', () => {
    const session = createBuilderSession(base())

    // Dropping on the LEFT of email: the dragged field is the first child, and
    // the row still belongs where email was. Those two are why the position is a
    // separate argument rather than "the first address".
    session.wrapLayoutNodes('web', [[0, 0], [1]], row(), [1])

    const nodes = layoutOf(session.document())
    expect(JSON.stringify(nodes[1])).toContain('"first"')
    expect(nodes.length).toBe(2)
  })

  test('an address that is not one of them is ignored, not obeyed', () => {
    const session = createBuilderSession(base())

    // Otherwise a caller could place the wrapper somewhere unrelated to
    // anything being wrapped, which has no meaning.
    const outcome = session.wrapLayoutNodes('web', [[0], [1]], row(), [9])

    expect(outcome.ok).toBe(true)
    expect(layoutOf(session.document()).length).toBe(1)
  })

  test('refuses to wrap a node inside one of the others', () => {
    const session = createBuilderSession(base())

    // [0] is the row that CONTAINS [0, 0]. Wrapping both would have to put the
    // row inside a container that also holds its own child.
    const outcome = session.wrapLayoutNodes('web', [[0], [0, 0]], row())

    expect(outcome.ok).toBe(false)
  })

  test('refuses fewer than two nodes, which is what insert is for', () => {
    const session = createBuilderSession(base())

    expect(session.wrapLayoutNodes('web', [[0]], row()).ok).toBe(false)
    expect(session.wrapLayoutNodes('web', [], row()).ok).toBe(false)
  })

  test('refuses the same node twice', () => {
    const session = createBuilderSession(base())

    // Otherwise the node is spliced out once and inserted twice, which would
    // place one field in two positions and quietly invalidate the document.
    expect(session.wrapLayoutNodes('web', [[0], [0]], row()).ok).toBe(false)
  })

  test('refuses a container that is not one', () => {
    const session = createBuilderSession(base())

    expect(
      session.wrapLayoutNodes('web', [[0], [1]], { kind: 'field', path: 'email' }).ok,
    ).toBe(false)
  })

  test('refuses an address that is not there', () => {
    const session = createBuilderSession(base())

    expect(session.wrapLayoutNodes('web', [[0], [9]], row()).ok).toBe(false)
  })

  test('leaves the document valid, so it can still be published', () => {
    const session = createBuilderSession(base())

    session.wrapLayoutNodes('web', [[0], [1]], row())

    // The guard that matters: a layout edit that places a field twice, or loses
    // one, stays syntactically fine and fails at publish. This asserts it does
    // not happen rather than trusting the splices above.
    expect(session.canPublish().valid).toBe(true)
  })
})

describe('setLayoutNodeLabel', () => {
  test('sets and clears', () => {
    const session = createBuilderSession(base())

    session.setLayoutNodeLabel({ layout: 'web', path: [0] }, 'Your name')
    const withLabel = layoutOf(session.document())[0]
    expect(withLabel?.kind === 'row' ? withLabel.label : undefined).toBe('Your name')

    session.setLayoutNodeLabel({ layout: 'web', path: [0] }, undefined)
    const cleared = layoutOf(session.document())[0]
    expect(cleared?.kind === 'row' ? 'label' in cleared : true).toBe(false)
  })

  test('refuses a message reference that resolves nowhere', () => {
    const session = createBuilderSession(base())

    // The same rule as every other label: a reference that resolves to nothing
    // would put a message id in front of a person.
    expect(session.setLayoutNodeLabel({ layout: 'web', path: [0] }, { $t: 'nope' }).ok).toBe(false)
  })
})

describe('addLayout and removeLayout', () => {
  test('a new layout starts empty, which is legal', () => {
    const session = createBuilderSession(base())

    expect(session.addLayout('print').ok).toBe(true)
    expect(session.document().layouts?.map((layout) => layout.name)).toEqual(['web', 'print'])
  })

  test('two layouts cannot share a name', () => {
    const session = createBuilderSession(base())

    expect(session.addLayout('web').ok).toBe(false)
  })

  test('removing the last layout leaves the section off rather than empty', () => {
    const session = createBuilderSession(base())

    session.removeLayout('web')

    // An empty `layouts: []` and no `layouts` at all mean the same thing to a
    // renderer, and only one of them survives a round trip unchanged.
    expect(session.document().layouts).toBeUndefined()
  })

  test('a form with no layouts can get one', () => {
    const { layouts: _dropped, ...withoutLayouts } = base()
    const session = createBuilderSession(withoutLayouts)

    expect(session.addLayout('web').ok).toBe(true)
    expect(session.document().layouts).toEqual([{ name: 'web', nodes: [] }])
  })
})

describe('validLayoutTargets', () => {
  test('offers every position in every container, not just the end', () => {
    const session = createBuilderSession(base())

    // A new row, which can never be a duplicate — an already-placed field is
    // refused everywhere, which the next test but one covers.
    const targets = session.validLayoutTargets('web', row())

    // Top level holds 2 nodes, so 3 positions; the row holds 2, so 3 more.
    // Offering only the end would make the keyboard path weaker than a drag,
    // which is exactly what SC 2.5.7 is about.
    expect(targets.filter((target) => target.parent.length === 0)).toHaveLength(3)
    expect(targets.filter((target) => target.parent.join() === '0')).toHaveLength(3)
  })

  test('a node being moved is not offered a position inside itself', () => {
    const session = createBuilderSession(base())

    const targets = session.validLayoutTargets('web', [0])

    expect(targets.some((target) => target.parent[0] === 0)) .toBe(false)
  })

  test('a node being moved is not offered the position it already has', () => {
    const session = createBuilderSession(base())

    const targets = session.validLayoutTargets('web', [1])

    // It sits at top-level index 1. After lifting it out, both index 1 and the
    // index it came from describe the same arrangement.
    expect(targets.filter((target) => target.parent.length === 0)).toHaveLength(1)
  })

  test('a field already placed is offered nowhere', () => {
    const session = createBuilderSession(base())

    expect(session.validLayoutTargets('web', { kind: 'field', path: 'email' })).toEqual([])
  })

  test('an unknown layout has no targets rather than throwing', () => {
    const session = createBuilderSession(base())

    expect(session.validLayoutTargets('print', row())).toEqual([])
  })
})

describe('unplacedFields', () => {
  test('names what the arrangement leaves out', () => {
    const session = createBuilderSession(base())

    session.removeLayoutNode({ layout: 'web', path: [1] })

    // A layout that silently drops a field is the failure this exists to make
    // visible: the form still collects it, and nobody can see it to fill in.
    expect(session.unplacedFields('web')).toEqual(['email'])
  })

  test('is empty when everything is placed', () => {
    const session = createBuilderSession(base())

    expect(session.unplacedFields('web')).toEqual([])
  })
})

describe('history', () => {
  test('a layout edit is undoable like any other command', () => {
    const session = createBuilderSession(base())

    session.insertLayoutNode({ layout: 'web', parent: [], index: 0 }, row())
    expect(layoutOf(session.document())).toHaveLength(3)

    session.undo()

    expect(layoutOf(session.document())).toHaveLength(2)
  })
})

/**
 * An arrangement is a view of the model, and cannot outlive what it views.
 *
 * Both of these were refusals before they were features: a layout node
 * pointing at a field that no longer exists — or at a key that has been
 * renamed — makes the document invalid, and the session refuses any command
 * that would produce one. Which meant that once a field had been arranged, it
 * could not be deleted or renamed at all.
 */
describe('the model and the arrangement stay in step', () => {
  test('deleting a field takes it out of every arrangement', () => {
    const session = createBuilderSession(base())

    const outcome = session.removeField(['last'])

    expect(outcome.ok).toBe(true)
    expect(layoutOf(session.document())).toEqual([
      { kind: 'row', children: [{ kind: 'field', path: 'first' }] },
      { kind: 'field', path: 'email' },
    ])
  })

  test('the row it emptied stays, rather than taking its neighbours with it', () => {
    const session = createBuilderSession(base())

    session.removeField(['first'])
    session.removeField(['last'])

    // Silently removing the row would rearrange everything beside it as a
    // side effect of deleting a field, which nobody asked for.
    expect(layoutOf(session.document())[0]).toEqual({ kind: 'row', children: [] })
  })

  test('renaming a field repoints every arrangement at it', () => {
    const session = createBuilderSession(base())

    const outcome = session.renameField(['email'], 'contactEmail')

    expect(outcome.ok).toBe(true)
    expect(layoutOf(session.document())[1]).toEqual({ kind: 'field', path: 'contactEmail' })
  })

  test('renaming a group repoints the fields inside it', () => {
    const session = createBuilderSession({
      specVersion: '1',
      id: 'grouped',
      title: 'Grouped',
      model: {
        fields: [
          { key: 'contact', type: 'group', label: 'Contact', fields: [{ key: 'email', type: 'text', label: 'Email' }] },
        ],
      },
      layouts: [{ name: 'web', nodes: [{ kind: 'field', path: 'contact.email' }] }],
    })

    session.renameField(['contact'], 'reach')

    expect(layoutOf(session.document())).toEqual([{ kind: 'field', path: 'reach.email' }])
  })

  test('deleting a group takes the fields inside it out too', () => {
    const session = createBuilderSession({
      specVersion: '1',
      id: 'grouped',
      title: 'Grouped',
      model: {
        fields: [
          { key: 'contact', type: 'group', label: 'Contact', fields: [{ key: 'email', type: 'text', label: 'Email' }] },
          { key: 'notes', type: 'textarea', label: 'Notes' },
        ],
      },
      layouts: [
        {
          name: 'web',
          nodes: [{ kind: 'field', path: 'contact.email' }, { kind: 'field', path: 'notes' }],
        },
      ],
    })

    session.removeField(['contact'])

    expect(layoutOf(session.document())).toEqual([{ kind: 'field', path: 'notes' }])
  })

  test('a page contributes no segment, so a field inside one is still found', () => {
    const session = createBuilderSession({
      specVersion: '1',
      id: 'paged',
      title: 'Paged',
      model: {
        fields: [
          { key: 'p1', type: 'page', label: 'One', fields: [{ key: 'email', type: 'text', label: 'Email' }] },
        ],
      },
      layouts: [{ name: 'web', nodes: [{ kind: 'field', path: 'email' }] }],
    })

    // A layout addresses `email`, not `p1.email`. Getting this wrong would
    // leave the node behind and refuse the delete.
    expect(session.removeField(['p1', 'email']).ok).toBe(true)
    expect(layoutOf(session.document())).toEqual([])
  })

  test('every arrangement, not just the first', () => {
    const session = createBuilderSession({
      ...base(),
      layouts: [
        { name: 'web', nodes: [{ kind: 'field', path: 'email' }] },
        { name: 'print', nodes: [{ kind: 'field', path: 'email' }] },
      ],
    })

    session.removeField(['email'])

    expect(layoutOf(session.document(), 'web')).toEqual([])
    expect(layoutOf(session.document(), 'print')).toEqual([])
  })
})
