import { provideZonelessChangeDetection } from '@angular/core'
import type { Type } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { afterEach, describe, expect, test } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/angular'
import { userEvent } from '@testing-library/user-event'
import {
  BUILDER_MESSAGES_DE,
  authorForm,
  createBuilderSession,
  createBuilderText,
  editableLayoutPropertiesFor,
  editablePropertiesFor,
  flatten,
  nameOf,
  paletteEntries,
  proposeEdit,
  pseudoLanguage,
  untranslated,
} from '@formancy/builder-core'
import { runScenarios } from '@formancy/core'
import type { Scenario } from '@formancy/core'
import type { BuilderText } from '@formancy/builder-core'
import { DECLINE_KEY } from '@formancy/spec'
import type { FormSchema } from '@formancy/spec'
import { FormancyBuilder } from './builder'
import { FormancyLayoutPane } from './layout-pane'
import { FormancyColumnsEditor } from './columns-editor'
import { FormancyLayoutPropertyPanel } from './layout-property-panel'
import { FormancyLogicPanel } from './logic-panel'
import { FormancyPromptPane } from './prompt-pane'
import { FormancyScenarioPane } from './scenario-pane'
import { FormancyTranslationsPane } from './translations-pane'
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
    // Code is not language: a rule's CEL, or a model's raw answer, is shown as written.
    if (node.parentElement?.closest('code, pre') !== null) continue
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
    // The palette's type names are NOT here: they are the spec's words, translated
    // through the language's schema and marked like everything else (0121).
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
      // A property's choices are the format's tokens; its title and description are
      // the spec's words, translated and marked, and so not allowed here (0121).
      ...properties.flatMap((property) => [
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

describe('the translations, prompt and scenario panes', () => {
  async function mounted<T>(component: Type<T>, inputs: Record<string, unknown>) {
    const view = await render(component, {
      componentInputs: inputs,
      providers: [provideZonelessChangeDetection()],
    })
    await view.fixture.whenStable()
    const user = userEvent.setup()
    return {
      root: view.container as Element,
      settle: async (): Promise<void> => {
        await view.fixture.whenStable()
      },
      user,
    }
  }

  const translated = {
    specVersion: '2',
    id: 'contact',
    title: 'Contact',
    model: {
      fields: [
        { key: 'email', type: 'text', label: { $t: 'email.label' } },
        { key: 'note', type: 'text', label: { $t: 'note.label' } },
      ],
    },
    i18n: {
      defaultLocale: 'en',
      messages: {
        en: { 'email.label': 'Email', 'note.label': 'Note', 'gone.label': 'Gone' },
        de: { 'email.label': 'E-Mail' },
      },
    },
  } as unknown as FormSchema
  const catalogueWords = (document: FormSchema): string[] => [
    document.title,
    ...Object.keys(document.i18n?.messages ?? {}),
    ...Object.values(document.i18n?.messages ?? {}).flatMap((messages) => [
      ...Object.keys(messages),
      ...Object.values(messages),
    ]),
  ]

  test('the translations pane shows nothing in English that the catalogue did not give it', async () => {
    const session = createBuilderSession(translated, { text: createBuilderText(pseudoLanguage()) })
    session.importCatalogue({
      locale: 'de',
      defaultLocale: 'en',
      messages: [
        { id: 'note.label', source: 'Old note', target: '' },
        { id: 'missing.label', source: 'Missing', target: 'Fehlt' },
      ],
    })
    const { root, settle, user } = await mounted(FormancyTranslationsPane, { session })
    await user.selectOptions(screen.getByRole('combobox'), 'de')
    await settle()

    // The preview is the FORM, in the renderer's words rather than the builder's —
    // all but its name and its button, which the pane gives it.
    const outside = root.cloneNode(true) as Element
    const preview = outside.querySelector('[data-formancy-part="translations-preview"]')!
    const seen = [
      preview.getAttribute('aria-label') ?? '',
      preview.querySelector('[data-formancy-part="submit"]')?.textContent ?? '',
    ]
    for (const child of [...preview.children]) child.remove()
    seen.push(...shown(outside))

    expect(untranslated(seen, [...catalogueWords(translated), 'missing.label'])).toEqual([])
    expect(
      [
        'Language',
        '(default)',
        'New language',
        'Add language',
        'Download de',
        'Upload a translated file',
        'translations written',
        'Not written',
        'Written, but',
        'Not translated',
        'Preview in de',
        'Submit',
        'no longer used',
      ].filter((prefix) => !seen.some((text) => text.includes(prefix))),
    ).toEqual([])
  })

  test('the prompt pane, with a proposal and with a failure, likewise', async () => {
    const start = {
      specVersion: '2',
      id: 'start',
      title: 'Start',
      model: { fields: [{ key: 'name', type: 'text', label: 'Name' }] },
    } as unknown as FormSchema
    const written = {
      ...start,
      model: { fields: [...start.model.fields, { key: 'email', type: 'text', label: 'Email' }] },
    } as unknown as FormSchema
    const words = [
      ...proposeEdit(start, written).changes.flatMap((change) => [change.path, change.detail]),
      'Name',
      'Email',
      'add an email',
      'anything',
    ]

    const good = await mounted(FormancyPromptPane, {
      session: createBuilderSession(start, { text: createBuilderText(pseudoLanguage()) }),
      ask: () => Promise.resolve(JSON.stringify(written)),
    })
    await good.user.type(screen.getByRole('textbox'), 'add an email')
    await good.settle()
    await good.user.click(screen.getByRole('button'))
    await waitFor(() => {
      // Synchronous: Angular's waitFor re-runs until it holds, which settles the fixture.
      // The review, not "more than one button": while it waits the pane shows Stop too.
      expect(document.querySelector('[data-formancy-part="prompt-review"]')).not.toBeNull()
    })
    await good.settle()
    const seen = shown(good.root)
    TestBed.resetTestingModule()
    document.body.innerHTML = ''

    const failing = (): Promise<string> => Promise.resolve('not json at all')
    const told = await authorForm(failing, 'anything', { attempts: 1 })
    const problems = told.ok ? [] : told.problems.map((problem) => problem.detail)
    const bad = await mounted(FormancyPromptPane, {
      session: createBuilderSession(start, { text: createBuilderText(pseudoLanguage()) }),
      ask: failing,
      attempts: 1,
    })
    await bad.user.type(screen.getByRole('textbox'), 'anything')
    await bad.settle()
    await bad.user.click(screen.getByRole('button'))
    await waitFor(() => {
      expect(document.querySelector('[data-formancy-part="prompt-problems"]')).not.toBeNull()
    })
    await bad.settle()
    seen.push(...shown(bad.root))

    expect(untranslated(seen, [...words, ...problems])).toEqual([])
    expect(
      [
        'Describe the form',
        'A contact form with',
        'Write it',
        'Ready to review',
        'Review these changes',
        'Apply these changes',
        'Discard',
        'Nothing was applied',
        'What the model last answered',
      ].filter((prefix) => !seen.some((text) => text.includes(prefix))),
    ).toEqual([])
  })

  test('the prompt pane, waiting, stopped, and with a model it cannot reach, likewise', async () => {
    // The words a stop and an unreachable model brought (0157), from the catalogue
    // like the rest — and the host's reason is the host's, in whatever it said.
    const start = {
      specVersion: '2',
      id: 'start',
      title: 'Start',
      model: { fields: [{ key: 'name', type: 'text', label: 'Name' }] },
    } as unknown as FormSchema
    const pseudo = () => createBuilderSession(start, { text: createBuilderText(pseudoLanguage()) })

    const waiting = await mounted(FormancyPromptPane, {
      session: pseudo(),
      ask: () => new Promise<string>(() => undefined),
    })
    await waiting.user.type(screen.getByRole('textbox'), 'anything')
    await waiting.settle()
    await waiting.user.click(screen.getByRole('button'))
    await waitFor(() => {
      expect(screen.getAllByRole('button')).toHaveLength(2)
    })
    const seen = shown(waiting.root)
    await waiting.user.click(screen.getAllByRole('button')[1]!)
    await waitFor(() => {
      expect(screen.getAllByRole('button')).toHaveLength(1)
    })
    await waiting.settle()
    seen.push(...shown(waiting.root))
    TestBed.resetTestingModule()
    document.body.innerHTML = ''

    const unreachable = await mounted(FormancyPromptPane, {
      session: pseudo(),
      ask: () => Promise.reject(new Error('the host said this')),
    })
    await unreachable.user.type(screen.getByRole('textbox'), 'anything')
    await unreachable.settle()
    await unreachable.user.click(screen.getByRole('button'))
    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('the host said this')
    })
    await unreachable.settle()
    seen.push(...shown(unreachable.root))

    expect(untranslated(seen, ['anything', 'the host said this'])).toEqual([])
    expect(seen.map((text) => text.trim())).toContain('⟦Stop⟧')
    expect(
      ['Writing the form', 'Stopped.', 'could not be reached'].filter(
        (prefix) => !seen.some((text) => text.includes(prefix)),
      ),
    ).toEqual([])
  })

  test('the prompt pane, when the model declines, likewise', async () => {
    // The decline's sentence is the catalogue's (0158), and the model's reason is the
    // model's, in whatever language it wrote.
    const start = {
      specVersion: '2',
      id: 'start',
      title: 'Start',
      model: { fields: [{ key: 'name', type: 'text', label: 'Name' }] },
    } as unknown as FormSchema

    const view = await mounted(FormancyPromptPane, {
      session: createBuilderSession(start, { text: createBuilderText(pseudoLanguage()) }),
      ask: () => Promise.resolve(JSON.stringify({ [DECLINE_KEY]: 'the model said this' })),
    })
    await view.user.type(screen.getByRole('textbox'), 'anything')
    await view.settle()
    await view.user.click(screen.getByRole('button'))
    await waitFor(() => {
      expect(screen.getByText('the model said this')).toBeTruthy()
    })
    await view.settle()
    const seen = shown(view.root)

    expect(untranslated(seen, ['anything', 'the model said this'])).toEqual([])
    expect(seen.some((text) => text.includes('declined this request'))).toBe(true)
  })

  test('the scenario panel, holding and not, and empty, likewise', async () => {
    const form = {
      specVersion: '2',
      id: 'leave',
      title: 'Leave',
      model: { fields: [{ key: 'reason', type: 'text', label: 'Reason' }] },
    } as unknown as FormSchema
    const scenarios = [
      { name: 'empty is valid', changes: {}, valid: true },
      { name: 'reason is hidden', changes: {}, visible: { reason: false } },
    ] as unknown as Scenario[]
    const failures = runScenarios(form, scenarios).flatMap((result) =>
      result.failures.map((failure) => failure.detail),
    )
    const session = createBuilderSession(form, { text: createBuilderText(pseudoLanguage()) })

    const one = await mounted(FormancyScenarioPane, { session, scenarios, removable: true })
    const seen = shown(one.root)
    TestBed.resetTestingModule()
    document.body.innerHTML = ''
    const none = await mounted(FormancyScenarioPane, { session, scenarios: [] })
    seen.push(...shown(none.root))

    expect(untranslated(seen, [...failures, 'empty is valid', 'reason is hidden'])).toEqual([])
    expect(
      ['Scenarios', 'does not hold', 'Remove empty is valid', 'No scenarios'].filter(
        (prefix) => !seen.some((text) => text.includes(prefix)),
      ),
    ).toEqual([])
  })
})
