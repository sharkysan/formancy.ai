import type { FormSchema } from '@formancy/spec'
import { describe, expect, test } from 'vitest'
import {
  addLayoutAndSay,
  arrangeDropAndSay,
  codeAnswers,
  dropLayoutAndSay,
  insertLayoutAndSay,
  layoutAdditions,
  layoutKeyHelp,
  layoutNodeFor,
  removeLayoutAndSay,
  unwrapLayoutAndSay,
  wrapAndSay,
  wrapCandidates,
} from './arrangement.js'
import { describeLayoutTarget, flattenLayout } from './layout-tree.js'
import { BUILDER_MESSAGES_DE } from './messages-de.js'
import { createBuilderText } from './messages.js'
import { createBuilderSession } from './session.js'

/**
 * What the arrangement pane offers and says, decided once.
 *
 * The two builders had drifted: React offered the unplaced fields and a code in
 * its add palette, Angular offered three containers and listed the unplaced
 * fields with no way to place one. Each case here is something both panes now
 * read from one place.
 */
const german = createBuilderText({ locale: 'de', messages: BUILDER_MESSAGES_DE })
const english = createBuilderText()

const arranged = (): FormSchema => ({
  specVersion: '2',
  id: 'signup',
  title: 'Sign up',
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
        {
          kind: 'row',
          children: [
            { kind: 'field', path: 'first' },
            { kind: 'field', path: 'last' },
          ],
        },
      ],
    },
  ],
})

describe('the add palette', () => {
  test('offers every field the arrangement leaves out, which the Angular pane could only list', () => {
    const additions = layoutAdditions(createBuilderSession(arranged()), 'web')

    expect(additions.map((addition) => addition.what)).toEqual([
      'container',
      'container',
      'container',
      'code',
      'field',
    ])
    expect(additions.at(-1)).toMatchObject({ what: 'field', path: 'email', label: 'Email' })
  })

  test('offers a code as locked in a version 1 document, saying which version it needs', () => {
    // Offered rather than hidden: hidden, a person looks for it; offered and
    // unlocked, the last step had no destination at all.
    const old = { ...arranged(), specVersion: '1' as const, layouts: [] }
    const session = createBuilderSession(old)
    session.addLayout('web')

    const code = layoutAdditions(session, 'web').find((addition) => addition.what === 'code')

    expect(code).toMatchObject({ locked: true })
    expect(code?.hint).toBe(english('layout.codeLocked', { version: '2', current: '1' }))
  })

  test('offers a code unlocked where the spec version has one', () => {
    const code = layoutAdditions(createBuilderSession(arranged()), 'web').find(
      (addition) => addition.what === 'code',
    )

    expect(code).toMatchObject({ locked: false, hint: english('layout.hint.qrcode') })
  })

  test('is in the session’s language', () => {
    const additions = layoutAdditions(createBuilderSession(arranged(), { text: german }), 'web')

    expect(additions[0]).toMatchObject({
      label: german('layout.kind.row'),
      hint: german('layout.hint.row'),
    })
  })
})

describe('a code', () => {
  test('can show any answer, placed or not, because it is a second view of one', () => {
    expect(codeAnswers(createBuilderSession(arranged())).map((answer) => answer.path)).toEqual([
      'first',
      'last',
      'email',
    ])
  })

  test('is labelled after its answer in the author’s language, because the label is its content', () => {
    const session = createBuilderSession(arranged(), { text: german })

    expect(layoutNodeFor(session, { what: 'code', path: 'email' })).toEqual({
      kind: 'qrcode',
      path: 'email',
      label: german('layout.newCode', { name: 'Email' }),
    })
  })
})

describe('what a command says', () => {
  const firstPlace = {
    location: { layout: 'web', parent: [] as number[], index: 0 },
    label: 'the web layout, as its first item',
  }

  test('adding names the new node the way a sentence would: "a row"', () => {
    const session = createBuilderSession(arranged())

    expect(
      insertLayoutAndSay(
        session,
        layoutNodeFor(session, { what: 'container', kind: 'row' }),
        firstPlace,
      ),
    ).toBe(english('said.added', { what: 'a row', where: 'the web layout, as its first item' }))
  })

  test('adding in German starts with the verb, because "eine Zeile" cannot start a sentence', () => {
    const session = createBuilderSession(arranged(), { text: german })

    expect(
      insertLayoutAndSay(
        session,
        layoutNodeFor(session, { what: 'container', kind: 'row' }),
        firstPlace,
      ),
    ).toBe(`Hinzugefügt: ${german('layout.new.row')} – the web layout, as its first item.`)
  })

  test('a drop names the node that moved, where the React pane said only "Moved."', () => {
    const session = createBuilderSession(arranged())
    session.insertLayoutNode(
      { layout: 'web', parent: [], index: 1 },
      { kind: 'field', path: 'email' },
    )

    expect(
      dropLayoutAndSay(
        session,
        { layout: 'web', path: [1] },
        { layout: 'web', parent: [0], index: 0 },
      ),
    ).toBe(english('said.dropped', { name: 'Email' }))
  })

  test('taking a node out says the form still collects it, so it does not read as a deletion', () => {
    const session = createBuilderSession(arranged())

    expect(removeLayoutAndSay(session, { layout: 'web', path: [0, 1] })).toBe(
      english('said.layoutRemoved', { name: 'Last name' }),
    )
    expect(session.unplacedFields('web')).toContain('last')
  })

  test('unwrapping names the container by what it held, read before it is gone', () => {
    const session = createBuilderSession(arranged())
    const name = flattenLayout(session.document(), 'web')[0]!.name

    expect(unwrapLayoutAndSay(session, { layout: 'web', path: [0] })).toBe(
      english('said.layoutUnwrapped', { name }),
    )
  })

  test('wrapping names both, the chosen one first, and puts it first in the row', () => {
    const session = createBuilderSession(arranged())
    session.insertLayoutNode(
      { layout: 'web', parent: [], index: 1 },
      { kind: 'field', path: 'email' },
    )
    const rowName = flattenLayout(session.document(), 'web')[0]!.name

    expect(wrapAndSay(session, 'web', [1], [0])).toBe(
      english('said.wrapped', { first: 'Email', second: rowName }),
    )
    const row = session.document().layouts?.[0]?.nodes[0]
    expect(row?.kind === 'row' && row.children[0]).toEqual({ kind: 'field', path: 'email' })
  })

  test('adding an arrangement names it', () => {
    const session = createBuilderSession({ ...arranged(), layouts: [] })

    expect(addLayoutAndSay(session)).toBe(english('said.layoutAdded', { name: 'web' }))
  })
})

describe('what may be wrapped with what', () => {
  test('never the item itself, anything inside it, or anything it is inside', () => {
    // The session refuses all three; offering them would be offering a refusal.
    const rows = flattenLayout(arranged(), 'web')
    const row = rows[0]!
    const first = rows[1]!

    expect(wrapCandidates(rows, row)).toEqual([])
    expect(wrapCandidates(rows, first).map((candidate) => candidate.path)).toEqual([[0, 1]])
  })
})

describe('the legend', () => {
  test('is the arrangement pane’s own, in the session’s language', () => {
    const legend = new Map(layoutKeyHelp(createBuilderSession(arranged(), { text: german })))

    expect(legend.get('w')).toBe(german('keys.layout.wrap.what'))
    expect(legend.get(german('keys.delete.key'))).toBe(german('keys.layout.delete.what'))
  })
})

describe('a drop on the rendered form', () => {
  test('wraps in the order the side aimed at says, and names both', () => {
    // Dropping Email on the START side of the row puts Email first.
    const session = createBuilderSession(arranged())
    session.insertLayoutNode(
      { layout: 'web', parent: [], index: 1 },
      { kind: 'field', path: 'email' },
    )
    const rowName = flattenLayout(session.document(), 'web')[0]!.name

    const said = arrangeDropAndSay(session, 'web', [1], { kind: 'wrap', side: 'start', over: [0] })

    expect(said).toBe(english('said.wrapped', { first: 'Email', second: rowName }))
    const row = session.document().layouts?.[0]?.nodes[0]
    expect(row?.kind === 'row' && row.children[0]).toEqual({ kind: 'field', path: 'email' })
  })

  test('moves and says where, described before the move', () => {
    const session = createBuilderSession(arranged())
    session.insertLayoutNode(
      { layout: 'web', parent: [], index: 1 },
      { kind: 'field', path: 'email' },
    )
    const location = { layout: 'web', parent: [0], index: 0 }
    const where = describeLayoutTarget(session.document(), location, [1], english)

    expect(
      arrangeDropAndSay(session, 'web', [1], {
        kind: 'move',
        location,
        edge: 'before',
        axis: 'inline',
      }),
    ).toBe(english('said.movedTo', { where }))
  })
})

describe('a group, in the arrangement pane', () => {
  /**
   * The pane offered a group among the fields to place, and placed, it broke the preview:
   * both renderers threw `Unknown field`. A group placed whole is drawn as its fields now,
   * so the pane offers it while none of its fields is placed — and once it is placed, not
   * its fields, which would be drawn twice (0151).
   */
  const withGroup = (): FormSchema =>
    ({
      specVersion: '1',
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
      layouts: [{ name: 'web', nodes: [{ kind: 'field', path: 'name' }] }],
    }) as FormSchema

  const offered = (session: ReturnType<typeof createBuilderSession>) =>
    layoutAdditions(session, 'web').flatMap((addition) => (addition.what === 'field' ? [addition.path] : []))

  test('offers it whole, places it, and then offers none of its fields', () => {
    const session = createBuilderSession(withGroup())
    expect(offered(session)).toEqual(['address', 'address.street', 'address.city'])

    const said = insertLayoutAndSay(
      session,
      { kind: 'field', path: 'address' },
      { location: { layout: 'web', parent: [], index: 1 }, label: 'the web layout, last' },
    )

    expect(said).toContain('Address')
    expect(session.document().layouts?.[0]?.nodes).toEqual([
      { kind: 'field', path: 'name' },
      { kind: 'field', path: 'address' },
    ])
    expect(offered(session)).toEqual([])
  })

  test('and refuses one of its fields beside it, saying why', () => {
    const session = createBuilderSession(withGroup())
    insertLayoutAndSay(
      session,
      { kind: 'field', path: 'address' },
      { location: { layout: 'web', parent: [], index: 1 }, label: 'the web layout, last' },
    )

    const said = insertLayoutAndSay(
      session,
      { kind: 'field', path: 'address.city' },
      { location: { layout: 'web', parent: [], index: 0 }, label: 'the web layout, first' },
    )

    expect(said).toContain('place the group or its fields, not both')
    expect(session.document().layouts?.[0]?.nodes).toHaveLength(2)
  })
})
