import { provideZonelessChangeDetection } from '@angular/core'
import type { Type } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { afterEach, describe, expect, test } from 'vitest'
import { render, screen, within } from '@testing-library/angular'
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
import type { BuilderText } from '@formancy/builder-core'
import type { FormSchema } from '@formancy/spec'
import { FormancyBuilder } from './builder'
import { FormancyLayoutPane } from './layout-pane'
import { FormancyColumnsEditor } from './columns-editor'
import { FormancyLayoutPropertyPanel } from './layout-property-panel'
import { FormancyLogicPanel } from './logic-panel'
import { FormancyOptionsEditor } from './options-editor'
import { FormancyPropertyPanel } from './property-panel'

afterEach(() => {
  TestBed.resetTestingModule()
  document.body.innerHTML = ''
})

/**
 * The builder speaks the session's language, and nothing on screen is English
 * written into the template.
 *
 * The same walk as `packages/builder-react/src/language.test.tsx`, judged by the
 * same function — `untranslated`, from builder-core — so the two builders cannot
 * disagree about what counts as English left in the code
 * ([0114](../../../docs/decisions/0114-the-builder-speaks-the-authors-language.md)).
 */
const form: FormSchema = {
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

function shown(root: Element): string[] {
  const out: string[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    // Code is not language: a rule's CEL is shown as it is written.
    if (node.parentElement?.closest('code') !== null) continue
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

function ownWords(document: FormSchema): string[] {
  return [
    document.title,
    ...flatten(document).map((node) => nameOf(document, node.def)),
    ...paletteEntries().flatMap((entry) => [entry.title, entry.description ?? '']),
    'a',
    'p',
    'u',
    'm',
  ]
}

async function mount(schema: FormSchema, text: BuilderText) {
  const session = createBuilderSession(schema, { text })
  const view = await render(FormancyBuilder, {
    componentInputs: { session },
    providers: [provideZonelessChangeDetection()],
  })
  await view.fixture.whenStable()
  const user = userEvent.setup()
  const settle = async (): Promise<void> => {
    await view.fixture.whenStable()
  }
  return {
    session,
    root: view.container as Element,
    press: async (keys: string) => {
      await user.keyboard(keys)
      await settle()
    },
    click: async (element: Element) => {
      await user.click(element as HTMLElement)
      await settle()
    },
  }
}

describe('the structure tree', () => {
  test('shows nothing in English that the catalogue did not give it', async () => {
    const { session, root, press, click } = await mount(form, createBuilderText(pseudoLanguage()))
    const seen: string[] = []
    const look = (): void => {
      seen.push(...shown(root))
    }

    look()
    await click(screen.getAllByRole('treeitem')[0]!)
    await press('{Control>}z{/Control}')
    look()

    await press('a')
    look()
    await click(within(screen.getByRole('dialog')).getAllByRole('button')[0]!)
    look()
    await click(within(screen.getByRole('dialog')).getAllByRole('button')[0]!)
    look()

    await click(screen.getAllByRole('treeitem')[0]!)
    await press('m')
    look()
    await click(within(screen.getByRole('dialog')).getAllByRole('button')[0]!)
    look()

    await press('p')
    look()

    expect(untranslated(seen, ownWords(session.document()))).toEqual([])

    // The walk reached every state it claims to: an assertion of absence is
    // satisfied by a walk that saw nothing.
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

  test('and an empty form says so in the session’s language', async () => {
    const german = createBuilderText({ locale: 'de', messages: BUILDER_MESSAGES_DE })
    await mount({ ...form, model: { fields: [] } }, german)

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

  async function mountPane(schema: FormSchema) {
    const session = createBuilderSession(schema, { text: createBuilderText(pseudoLanguage()) })
    const view = await render(FormancyLayoutPane, {
      componentInputs: { session },
      providers: [provideZonelessChangeDetection()],
    })
    await view.fixture.whenStable()
    const user = userEvent.setup()
    const settle = async (): Promise<void> => {
      await view.fixture.whenStable()
    }
    return {
      session,
      root: view.container as Element,
      press: async (keys: string) => {
        await user.keyboard(keys)
        await settle()
      },
      click: async (element: Element) => {
        await user.click(element as HTMLElement)
        await settle()
      },
    }
  }

  test('shows nothing in English that the catalogue did not give it', async () => {
    const { session, root, press, click } = await mountPane(arranged)
    const seen: string[] = []
    const look = (): void => {
      seen.push(...shown(root))
    }

    look()
    await click(screen.getAllByRole('treeitem')[0]!)

    await press('a')
    look()
    await click(within(screen.getByRole('dialog')).getAllByRole('button')[3]!)
    look()
    await click(within(screen.getByRole('dialog')).getAllByRole('button')[0]!)
    look()
    await click(within(screen.getByRole('dialog')).getAllByRole('button')[0]!)
    look()

    await click(screen.getAllByRole('treeitem')[0]!)
    await press('w')
    look()
    await press('{Escape}')
    await press('m')
    look()
    await click(within(screen.getByRole('dialog')).getAllByRole('button')[0]!)
    look()
    await press('{Delete}')
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
    const { session, root, press, click } = await mountPane({
      ...arranged,
      specVersion: '1',
      layouts: [],
    })
    const seen = shown(root)

    await click(screen.getByRole('button'))
    await click(screen.getByRole('tree'))
    await press('a')
    seen.push(...shown(root))

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

  async function shownBy<T>(component: Type<T>, inputs: Record<string, unknown>) {
    const view = await render(component, {
      componentInputs: inputs,
      providers: [provideZonelessChangeDetection()],
    })
    await view.fixture.whenStable()
    const seen = shown(view.container as Element)
    TestBed.resetTestingModule()
    document.body.innerHTML = ''
    return seen
  }

  test('show nothing in English that the catalogue did not give them', async () => {
    const text = createBuilderText(pseudoLanguage())
    const session = createBuilderSession(form, { text })
    const seen = [
      ...(await shownBy(FormancyPropertyPanel, { session, keyPath: ['country'] })),
      ...(await shownBy(FormancyPropertyPanel, { session, keyPath: ['lines'] })),
      ...(await shownBy(FormancyLayoutPropertyPanel, {
        session,
        address: { layout: 'web', path: [0] },
      })),
      // The two empty states and a column over a child that is gone, which the
      // session refuses to hold, so a valid document cannot reach them.
      ...(await shownBy(FormancyOptionsEditor, { options: [], text })),
      ...(await shownBy(FormancyColumnsEditor, { columns: [], children: [], text })),
      ...(await shownBy(FormancyColumnsEditor, {
        columns: [{ field: 'gone' }],
        children: [{ key: 'sku', type: 'text' }],
        text,
      })),
    ]

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

describe('the logic panel', () => {
  const ruled: FormSchema = {
    specVersion: '3',
    id: 'order',
    title: 'Order',
    model: {
      fields: [
        { key: 'country', type: 'text', label: 'Country' },
        { key: 'canton', type: 'text', label: 'Canton' },
      ],
    },
    logic: { rules: [{ target: 'canton', kind: 'visible', cel: 'country == "CH"' }] },
  }

  test('shows nothing in English that the catalogue did not give it', async () => {
    const session = createBuilderSession(ruled, { text: createBuilderText(pseudoLanguage()) })
    const view = await render(FormancyLogicPanel, {
      componentInputs: { session, keyPath: ['canton'] },
      providers: [provideZonelessChangeDetection()],
    })
    await view.fixture.whenStable()
    const user = userEvent.setup()
    const root = view.container as Element
    const settle = async (): Promise<void> => {
      await view.fixture.whenStable()
    }
    const seen = shown(root)

    await user.click(screen.getAllByRole('button').at(-1)!)
    await settle()
    await user.click(
      screen
        .getAllByRole('button')
        .find((button) => button.textContent?.includes('Add a comparison'))!,
    )
    await settle()
    seen.push(...shown(root))
    const kind = root.querySelector('select')!
    await user.selectOptions(kind, 'check')
    await settle()
    seen.push(...shown(root))
    await user.selectOptions(kind, 'computed')
    await settle()
    seen.push(...shown(root))

    const words = [
      ruled.title,
      ...flatten(ruled).flatMap((node) => [nameOf(ruled, node.def), node.def.key]),
    ]
    expect(untranslated(seen, words)).toEqual([])
    expect(
      [
        'Rules',
        'Remove the rule',
        'What the rule does',
        'Match',
        'Field 2',
        'Comparison 2',
        'Remove comparison 2',
        'Which check',
        'email-not-taken',
        'The calculation',
        'Add rule',
        'Show this field when',
        'is not answered',
      ].filter((prefix) => !seen.some((text) => text.includes(prefix))),
    ).toEqual([])
  })
})
