import { afterEach, describe, expect, test } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import {
  BUILDER_MESSAGES_DE,
  createBuilderSession,
  createBuilderText,
  editableLayoutPropertiesFor,
  editablePropertiesFor,
  flatten,
  nameOf,
  paletteEntries,
  pseudoLanguage,
  untranslated,
} from '@formancy/builder-core'
import type { FormSchema } from '@formancy/spec'
import { FormancyBuilder } from './builder.js'
import { FormancyLayoutPane } from './layout-pane.js'
import { ColumnsEditor } from './columns-editor.js'
import { LayoutPropertyPanel } from './layout-property-panel.js'
import { OptionsEditor } from './options-editor.js'
import { PropertyPanel } from './property-panel.js'

afterEach(cleanup)

/**
 * The builder speaks the session's language, and nothing on screen is English
 * written into the component.
 *
 * Pseudo-localised: every catalogue message is wrapped in `⟦ ⟧`, the tree is
 * walked through every state it can show — the empty form, both dialogs, the
 * locked types, an announcement — and whatever text is on screen outside the
 * marks has to be the document's own words or the spec's type names. A sentence
 * still written in the component is neither, and is named
 * ([0114](../../../docs/decisions/0114-the-builder-speaks-the-authors-language.md)).
 *
 * The Angular builder runs the same walk against the same judgement,
 * `untranslated` from builder-core, so the two cannot disagree about what
 * counts.
 */
const form: FormSchema = {
  // Version 1, so the palette has types it must explain are locked.
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
        fields: [{ key: 'street', type: 'text', label: 'Street' }],
      },
    ],
  },
}

/** Everything a person could read or hear: text, and the attributes that name things. */
function shown(root: HTMLElement): string[] {
  const out: string[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    out.push(node.nodeValue ?? '')
  }
  for (const element of root.querySelectorAll('*')) {
    for (const name of ['aria-label', 'title', 'placeholder', 'alt', 'aria-description']) {
      const value = element.getAttribute(name)
      if (value !== null) out.push(value)
    }
  }
  return out
}

/** The words that are not the builder's to translate: the document's, and the spec's. */
function ownWords(document: FormSchema): string[] {
  return [
    document.title,
    ...flatten(document).map((node) => nameOf(document, node.def)),
    ...paletteEntries().flatMap((entry) => [entry.title, entry.description ?? '']),
    // The legend's key letters are bindings, not words.
    'a',
    'p',
    'u',
    'm',
  ]
}

describe('the structure tree', () => {
  test('shows nothing in English that the catalogue did not give it', async () => {
    const user = userEvent.setup()
    const session = createBuilderSession(form, { text: createBuilderText(pseudoLanguage()) })
    const { container } = render(<FormancyBuilder session={session} />)
    const seen: string[] = []
    const look = (): void => {
      seen.push(...shown(container))
    }

    look()
    const tree = screen.getByRole('tree')

    // An announcement, through the live region.
    await user.click(screen.getAllByRole('treeitem')[0]!)
    await user.keyboard('{Control>}z{/Control}')
    look()

    // The add palette, with its locked types and the way forward.
    await user.keyboard('a')
    look()
    const palette = screen.getByRole('dialog')
    await user.click(within(palette).getAllByRole('button')[0]!)
    // Where it goes.
    look()
    await user.click(within(screen.getByRole('dialog')).getAllByRole('button')[0]!)
    look()

    // The move palette.
    act(() => {
      tree.querySelector<HTMLElement>('[role="treeitem"]')?.focus()
    })
    await user.keyboard('m')
    look()
    fireEvent.click(within(screen.getByRole('dialog')).getAllByRole('button')[0]!)
    look()

    // A page, which writes its own name into the document — so the document's
    // words are read again afterwards, not before.
    await user.keyboard('p')
    look()

    expect(untranslated(seen, ownWords(session.document()))).toEqual([])

    // And the walk reached every state it claims to. An assertion of absence is
    // satisfied by a walk that saw nothing; each of these is a state above.
    expect(
      [
        'Form structure',
        'Nothing to undo.',
        'Add a field',
        'Where should the',
        'Added ',
        'Move ',
        'Moved ',
        'Cancel',
        'need a later spec version',
        'Delete',
      ].filter((prefix) => !seen.some((text) => text.includes(prefix))),
    ).toEqual([])
  })

  test('and an empty form says so in the session’s language', () => {
    const empty: FormSchema = { ...form, model: { fields: [] } }
    const german = createBuilderText({ locale: 'de', messages: BUILDER_MESSAGES_DE })
    render(<FormancyBuilder session={createBuilderSession(empty, { text: german })} />)

    expect(screen.getByText(german('tree.empty'))).toBeTruthy()
    expect(screen.getByRole('tree', { name: german('tree.label') })).toBeTruthy()
  })
})

describe('the arrangement pane', () => {
  const arranged: FormSchema = {
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
  }
  const layoutWords = (document: FormSchema): string[] => [
    document.title,
    'web',
    ...flatten(document).map((node) => nameOf(document, node.def)),
    'a',
    'm',
    'u',
    'w',
  ]

  test('shows nothing in English that the catalogue did not give it', async () => {
    const user = userEvent.setup()
    const session = createBuilderSession(arranged, { text: createBuilderText(pseudoLanguage()) })
    const { container } = render(<FormancyLayoutPane session={session} />)
    const seen: string[] = []
    const look = (): void => {
      seen.push(...shown(container))
    }

    // The tree, the unplaced field, the legend.
    look()
    await user.click(screen.getAllByRole('treeitem')[0]!)

    // Adding a code: what, which answer, where, and the announcement.
    await user.keyboard('a')
    look()
    const what = screen.getByRole('dialog')
    await user.click(within(what).getAllByRole('button')[3]!)
    look()
    await user.click(within(screen.getByRole('dialog')).getAllByRole('button')[0]!)
    look()
    await user.click(within(screen.getByRole('dialog')).getAllByRole('button')[0]!)
    look()

    // Wrapping, with its help, and moving.
    act(() => {
      screen.getAllByRole('treeitem')[0]!.focus()
    })
    await user.keyboard('w')
    look()
    await user.keyboard('{Escape}m')
    look()
    fireEvent.click(within(screen.getByRole('dialog')).getAllByRole('button')[0]!)
    look()
    await user.keyboard('{Delete}')
    look()

    expect(untranslated(seen, layoutWords(session.document()))).toEqual([])
    expect(
      [
        'Arrangement',
        'Not in this arrangement',
        'Add to the arrangement',
        'Which answer',
        'Where should',
        'What should go beside',
        'Choose the item',
        'Move ',
        'take it out of the arrangement',
        'Added ',
      ].filter((prefix) => !seen.some((text) => text.includes(prefix))),
    ).toEqual([])
  })

  test('and a form with no arrangement, and a code it cannot have yet, likewise', async () => {
    const user = userEvent.setup()
    const old: FormSchema = { ...arranged, specVersion: '1', layouts: [] }
    const session = createBuilderSession(old, { text: createBuilderText(pseudoLanguage()) })
    const { container } = render(<FormancyLayoutPane session={session} />)
    const seen = shown(container)

    await user.click(screen.getByRole('button'))
    // A new arrangement places nothing, so the tree itself takes the keys.
    await user.click(screen.getByRole('tree'))
    await user.keyboard('a')
    seen.push(...shown(container))

    expect(untranslated(seen, layoutWords(session.document()))).toEqual([])
    expect(
      ['has no arrangement', 'Add an arrangement', 'needs spec version'].filter(
        (prefix) => !seen.some((text) => text.includes(prefix)),
      ),
    ).toEqual([])
  })
})

describe('the property panels and their editors', () => {
  const form = {
    specVersion: '3',
    id: 'order',
    title: 'Order',
    model: {
      fields: [
        {
          key: 'country',
          type: 'select',
          label: 'Country',
          options: [{ value: 'ch', label: 'Switzerland' }],
        },
        {
          key: 'lines',
          type: 'repeater',
          label: 'Lines',
          widget: 'datagrid',
          // One child left unnamed, so "Configure the … column" is shown.
          columns: [{ field: 'sku' }],
          fields: [
            { key: 'sku', type: 'text', label: 'SKU' },
            { key: 'qty', type: 'number', label: 'Quantity' },
          ],
        },
      ],
    },
    layouts: [
      {
        name: 'web',
        nodes: [{ kind: 'table', columns: 2, children: [{ kind: 'field', path: 'country' }] }],
      },
    ],
  } as unknown as FormSchema

  /**
   * The words that are not the builder's: the document's, and every title,
   * description and choice the spec's JSON Schema gives a property — which is
   * the schema's to word, and read from it here rather than listed.
   */
  const panelWords = (document: FormSchema): string[] => {
    const properties = [
      ...editablePropertiesFor('select'),
      ...editablePropertiesFor('repeater', 'datagrid'),
      ...editableLayoutPropertiesFor('table'),
    ]
    return [
      document.title,
      ...flatten(document).flatMap((node) => [
        nameOf(document, node.def),
        node.def.key,
        node.def.type,
      ]),
      ...properties.flatMap((property) => [
        property.title,
        property.description,
        ...(property.choices ?? []),
      ]),
      'table',
      'Switzerland',
      'ch',
      'gone',
    ]
  }

  test('show nothing in English that the catalogue did not give them', () => {
    const text = createBuilderText(pseudoLanguage())
    const session = createBuilderSession(form, { text })
    const seen: string[] = []

    for (const keyPath of [['country'], ['lines']]) {
      const { container, unmount } = render(<PropertyPanel session={session} keyPath={keyPath} />)
      seen.push(...shown(container))
      unmount()
    }
    {
      const { container, unmount } = render(
        <LayoutPropertyPanel session={session} address={{ layout: 'web', path: [0] }} />,
      )
      seen.push(...shown(container))
      unmount()
    }
    // The two empty states and a column over a child that is gone, which a valid
    // document cannot reach through the panel — the session refuses all three.
    for (const element of [
      <ColumnsEditor
        columns={[{ field: 'gone' }]}
        children={[{ key: 'sku', type: 'text' }]}
        onChange={() => undefined}
        text={text}
      />,
      <OptionsEditor options={[]} onChange={() => undefined} text={text} />,
      <ColumnsEditor columns={[]} children={[]} onChange={() => undefined} text={text} />,
    ]) {
      const { container, unmount } = render(element)
      seen.push(...shown(container))
      unmount()
    }

    expect(untranslated(seen, panelWords(form))).toEqual([])
    expect(
      [
        'Choices',
        'Choice label',
        'Stored value',
        'Add a choice',
        'Remove ',
        'Columns',
        'no such field',
        'Width, as a share',
        'Configure the qty column',
        'This grid',
        'No choices yet',
        'No columns configured',
      ].filter((prefix) => !seen.some((text) => text.includes(prefix))),
    ).toEqual([])
  })
})
