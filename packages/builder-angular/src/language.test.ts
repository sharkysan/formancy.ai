import { provideZonelessChangeDetection } from '@angular/core'
import type { Type } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/angular'
import { userEvent } from '@testing-library/user-event'
import {
  BUILDER_MESSAGES_DE,
  authorForm,
  createBuilderSession,
  createBuilderText,
  createRelay,
  createTranslationRun,
  editableLayoutPropertiesFor,
  editablePropertiesFor,
  flatten,
  ModelBusyError,
  nameOf,
  paletteEntries,
  proposeEdit,
  pseudoLanguage,
  translateCatalogue,
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
import { FormancyRelayPane } from './relay-pane'
import { FormancyScenarioPane } from './scenario-pane'
import { FormancyTranslationsPane } from './translations-pane'
import { FormancyOptionsEditor } from './options-editor'
import { FormancyPropertyPanel } from './property-panel'

afterEach(() => {
  TestBed.resetTestingModule()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
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

  test('a model’s translation under review, waiting, and failing, likewise', async () => {
    // The review's every word is the catalogue's (0161), as in the React part. The sources
    // and what the model wrote are the form's and the model's, in their languages.
    const three = {
      ...translated,
      model: { fields: [...translated.model.fields, { key: 'phone', type: 'text', label: { $t: 'phone.label' } }] },
      i18n: {
        ...translated.i18n!,
        messages: { ...translated.i18n!.messages, en: { ...translated.i18n!.messages['en'], 'phone.label': 'Phone' } },
      },
    } as unknown as FormSchema
    const pseudo = () => createBuilderSession(three, { text: createBuilderText(pseudoLanguage()) })
    const part = (root: Element, name: string): Element | null =>
      root.querySelector(`[data-formancy-part="${name}"]`)
    /** What is on screen outside the previews, which are the form in the renderer's words. */
    const outsidePreviews = (root: Element): string[] => {
      const copy = root.cloneNode(true) as Element
      const kept: string[] = []
      for (const preview of copy.querySelectorAll('[data-formancy-part="translations-preview"]')) {
        kept.push(
          preview.getAttribute('aria-label') ?? '',
          preview.querySelector('[data-formancy-part="submit"]')?.textContent ?? '',
        )
        for (const child of [...preview.children]) child.remove()
      }
      return [...kept, ...shown(copy)]
    }
    // Written by the model, as in the React part: one whose English became "Remark" while it
    // answered, written as "Remark" — the same as its source, and from a source that has
    // since changed — and one it was not asked for.
    const answer = JSON.stringify({
      locale: 'de',
      defaultLocale: 'en',
      messages: [
        { id: 'note.label', source: 'Note', target: 'Remark' },
        { id: 'gone.label', source: 'Gone', target: 'Weg' },
      ],
    })
    const reset = (): void => {
      TestBed.resetTestingModule()
      document.body.innerHTML = ''
    }
    const opened = async (ask: unknown, attempts?: number, session = pseudo()) => {
      const view = await mounted(FormancyTranslationsPane, {
        session,
        ask,
        ...(attempts === undefined ? {} : { attempts }),
      })
      await view.user.selectOptions(screen.getAllByRole('combobox')[0]!, 'de')
      await view.settle()
      await view.user.click(part(view.root, 'translate')!.querySelector('button')!)
      return view
    }

    const waiting = await opened(() => new Promise<string>(() => undefined))
    await waitFor(() => expect(part(waiting.root, 'translate')!.querySelectorAll('button')).toHaveLength(2))
    await waiting.settle()
    const seen = outsidePreviews(waiting.root)
    reset()

    const moving = pseudo()
    const reviewing = await opened(
      () => {
        moving.setMessage('en', 'note.label', 'Remark')
        return Promise.resolve(answer)
      },
      undefined,
      moving,
    )
    await waitFor(() => expect(part(reviewing.root, 'translate-review')).not.toBeNull())
    await reviewing.settle()
    seen.push(...outsidePreviews(reviewing.root))
    reset()

    // A relay's turn for another pane, waiting: busy, worded by the catalogue (0162).
    const refused = await opened(() => Promise.reject(new ModelBusyError()))
    await waitFor(() => expect(part(refused.root, 'translate-status')!.textContent).toMatch(/Another request/))
    await refused.settle()
    seen.push(...outsidePreviews(refused.root))
    reset()

    // A run the host holds for German, drawn on the default language: where it waits, worded
    // by the catalogue (0164).
    const held = createTranslationRun()
    const elsewhere = await mounted(FormancyTranslationsPane, {
      session: pseudo(),
      ask: () => new Promise<string>(() => undefined),
      run: held,
    })
    await elsewhere.user.selectOptions(screen.getAllByRole('combobox')[0]!, 'de')
    await elsewhere.settle()
    await elsewhere.user.click(part(elsewhere.root, 'translate')!.querySelector('button')!)
    await elsewhere.user.selectOptions(screen.getAllByRole('combobox')[0]!, 'en')
    await waitFor(() => expect(part(elsewhere.root, 'translate-status')!.textContent).toMatch(/translating into de/))
    await elsewhere.settle()
    seen.push(...outsidePreviews(elsewhere.root))
    reset()
    held.discard()

    const failing = await opened(() => Promise.resolve('not json at all'), 1)
    await waitFor(() => expect(part(failing.root, 'translate-problems')).not.toBeNull())
    await failing.settle()
    seen.push(...outsidePreviews(failing.root))
    const told = await translateCatalogue(() => Promise.resolve('not json at all'), three, 'de', {
      attempts: 1,
    })
    const problems = told.ok ? [] : told.problems.map((problem) => problem.detail)

    expect(
      untranslated(seen, [...catalogueWords(three), 'Remark', 'not json at all', ...problems]),
    ).toEqual([])
    expect(
      [
        'Ask a model for the',
        'Asking…',
        'Stop',
        'Asking for the missing translations',
        'Review these translations into de',
        'Before',
        'Proposed',
        'To look at',
        'The same as the source',
        'Translated from wording',
        'Not translated',
        'Not written, because',
        'Preview in de, as proposed',
        'Apply these translations',
        'Discard',
        'Translate the rest',
        'Ready to review',
        'still missing',
        'was still not a catalogue',
        'What the model last answered',
        'Another request is still waiting',
        'A model is translating into de',
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
        'In answer to',
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

  test('the prompt pane, with an answer that stops an example holding, likewise', async () => {
    // The review names the examples (0159): their names are the host's, and every word
    // around them is the catalogue's, in the heading and in the status alike.
    const ruled = (cel: string): FormSchema =>
      ({
        specVersion: '2',
        id: 'travel',
        title: 'Travel',
        model: {
          fields: [
            { key: 'country', type: 'text', label: 'Country' },
            { key: 'canton', type: 'text', label: 'Canton' },
          ],
        },
        logic: { rules: [{ target: 'canton', kind: 'visible', cel }] },
      }) as unknown as FormSchema
    const right = ruled('country == "CH"')
    const backwards = ruled('country != "CH"')
    const example: Scenario = {
      name: 'Switzerland asks for a canton',
      changes: { country: 'CH' },
      valid: true,
      visible: { canton: true },
    }
    const words = [
      ...proposeEdit(right, backwards).changes.flatMap((change) => [change.path, change.detail]),
      example.name,
      'invert it',
    ]

    const view = await mounted(FormancyPromptPane, {
      session: createBuilderSession(right, { text: createBuilderText(pseudoLanguage()) }),
      ask: () => Promise.resolve(JSON.stringify(backwards)),
      scenarios: [example],
    })
    await view.user.type(screen.getByRole('textbox'), 'invert it')
    await view.settle()
    await view.user.click(screen.getByRole('button'))
    await waitFor(() => {
      expect(document.querySelector('[data-formancy-part="prompt-review"]')).not.toBeNull()
    })
    await view.settle()
    const seen = shown(view.root)

    expect(untranslated(seen, words)).toEqual([])
    expect(
      ['scenario would stop holding', 'Would stop holding if applied'].filter(
        (prefix) => !seen.some((text) => text.includes(prefix)),
      ),
    ).toEqual([])
  })

  test('the relay pane, on a first turn and a retry, a copy made and one refused, and given prose, likewise', async () => {
    // The relay's words (0160), from the catalogue like the rest. The request is the
    // model's to read and is carried as written, in English whatever the author speaks —
    // as the prompt pane's problems are — and the chat's name is the host's.
    const start = {
      specVersion: '2',
      id: 'start',
      title: 'Start',
      model: { fields: [{ key: 'name', type: 'text', label: 'Name' }] },
    } as unknown as FormSchema
    const relay = createRelay()
    const prose = 'Sure, here is your form'
    const view = await mounted(FormancyRelayPane, {
      session: createBuilderSession(start, { text: createBuilderText(pseudoLanguage()) }),
      relay,
      chat: { name: 'Chat', href: 'https://chat.example/' },
    })
    // The first copy is let through and the second refused, so both of what Copy can say
    // are on screen once: a walk that only ever refused never showed "Copied".
    vi.spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValueOnce(undefined)
      .mockRejectedValue(new Error('refused'))

    void authorForm(relay.ask, 'anything', { current: start })
    const first = relay.waiting()!
    const buttons = () => within(view.root as HTMLElement).getAllByRole('button')
    await waitFor(() => expect(buttons()).toHaveLength(2))
    const status = () => view.root.querySelector('[role="status"]')?.textContent ?? ''
    await view.user.click(buttons()[0]!)
    await waitFor(() => expect(status().trim()).not.toBe(''))
    await view.settle()
    const seen = shown(view.root)
    const copied = status()
    await view.user.click(buttons()[0]!)
    await waitFor(() => expect(status()).not.toBe(copied))
    await view.settle()
    seen.push(...shown(view.root))

    await view.user.click(within(view.root as HTMLElement).getAllByRole('textbox')[1]!)
    await view.user.paste(prose)
    await view.settle()
    await view.user.click(buttons()[1]!)
    await waitFor(() => expect(buttons()).toHaveLength(3))
    await view.settle()
    seen.push(...shown(view.root))
    await view.user.click(buttons()[2]!)
    await waitFor(() => expect(relay.waiting()?.prompt.attempt).toBe(2))
    await waitFor(() => expect(buttons()).toHaveLength(3))
    await view.settle()
    const retry = relay.waiting()!
    seen.push(...shown(view.root))

    const carried = [first.prompt.user, first.message, retry.prompt.user, retry.followUp ?? '', retry.message]
    expect(untranslated(seen, [...carried, prose, 'Chat'])).toEqual([])
    expect(
      [
        'Take this request to a model',
        'Turn 1 of at most',
        'Copy the request into a chat',
        'This pane sends the request nowhere',
        'What the model is told',
        'Copy the request',
        'Open Chat in a new tab',
        'The model’s answer',
        'Check this answer',
        'Copied. Paste',
        'did not let the page copy',
        'There is no JSON object',
        'Use it anyway',
        'That answer did not work',
        'Copy what was wrong',
        'New chat?',
      ].filter((prefix) => !seen.some((text) => text.includes(prefix))),
    ).toEqual([])
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

/**
 * The drafting part's walk, shared in shape with the Angular language test: a form, the
 * drafts a model answers with — one holding, one failing with a reason, one naming a field
 * the form lacks, and three that are not examples — and every word that is not the
 * builder's: the drafts' names and reasons, the engine's failures, the model's own words.
 */
const DRAFTING_FORM = {
  specVersion: '2',
  id: 'leave',
  title: 'Leave',
  model: {
    fields: [
      { key: 'kind', type: 'radio', label: 'Kind', options: [{ value: 'other', label: 'Other' }] },
      { key: 'reason', type: 'text', label: 'Reason' },
    ],
  },
  logic: { rules: [{ target: 'reason', kind: 'visible', cel: "kind == 'other'" }] },
} as unknown as FormSchema
const DRAFTED: Scenario[] = [
  { name: 'other asks why', changes: { kind: 'other' }, valid: true, visible: { reason: true } },
  { name: 'nothing asks why', because: 'the model’s own reason', changes: {}, valid: true, visible: { reason: true } },
  { name: 'names a ghost', changes: { region: 'north' }, valid: true },
]
const DRAFTING_ANSWER = JSON.stringify({
  scenarios: [
    ...DRAFTED,
    { changes: {}, valid: true },
    { name: 'with a stranger', changes: {}, valid: true, expected: 1 },
    { name: 'badly shaped', changes: {}, valid: true, errors: 'required' },
  ],
})
const DRAFTING_WORDS = [
  'anything',
  'the model said this',
  'offline',
  ...DRAFTED.flatMap((draft) => [draft.name, draft.because ?? '']),
  'with a stranger',
  'badly shaped',
  ...runScenarios(DRAFTING_FORM, DRAFTED).flatMap((result) => result.failures.map((failure) => failure.detail)),
]
/** What the walk must have reached, so a run that stopped early cannot pass by showing little. */
const DRAFTING_REACHED = [
  'Draft examples with a model',
  'What should this form do',
  'never its rules',
  // A model that saw the form earlier in the same chat has seen its rules, and only the
  // person can prevent that: the part says so where they type.
  'start a new one',
  'Switzerland asks for a canton',
  'examples drafted',
  'could not be used',
  'Holds against the form',
  'Does not hold against the form',
  'has no name',
  'which an example does not have',
  'is not what an example holds there',
  'Not kept: names a ghost',
  'Kept nothing asks why',
  'Discarded other asks why',
  'declined this request',
  '3 attempts',
  'held no JSON object',
  'What the model last answered',
  'could not be reached: ',
  'Another request is still waiting',
  // The model's own reason for declining, quoted beneath the status rather than lost.
  'the model said this',
  'Drafting…',
  'Stop drafting',
  'Stopped. Nothing was drafted.',
]

describe('the drafting part', () => {
  test('through a run, a keep, a refusal, a discard and every way a run ends, shows nothing in English the catalogue did not give it', async () => {
    // Drafting's words are the catalogue's (0162). The model's request is in English
    // whatever the author speaks, as the prompt pane's is, and is the relay's to show; what
    // the part says about a run is translated, and the drafts are the model's own words.
    const session = createBuilderSession(DRAFTING_FORM, { text: createBuilderText(pseudoLanguage()) })
    const answers: Array<() => Promise<string>> = [
      () => Promise.resolve(DRAFTING_ANSWER),
      () => Promise.resolve(JSON.stringify({ [DECLINE_KEY]: 'the model said this' })),
      () => Promise.resolve('nope'),
      () => Promise.resolve('nope'),
      () => Promise.resolve('nope'),
      () => Promise.reject(new Error('offline')),
      // A relay's turn for another pane, waiting: busy, worded by the catalogue, never
      // the relay's own English (0162).
      () => Promise.reject(new ModelBusyError()),
      () => new Promise<string>(() => undefined),
    ]
    const ask = () => answers.shift()!()
    const user = userEvent.setup()
    const view = await render(FormancyScenarioPane, {
      componentInputs: { session, scenarios: [], removable: true, ask },
      providers: [provideZonelessChangeDetection()],
    })
    const root = view.container as Element
    const button = (name: RegExp) => within(root as HTMLElement).getByRole('button', { name })
    const status = () => root.querySelector('[data-formancy-part="scenario-drafts-status"]')?.textContent ?? ''
    const seen: string[] = []
    const settle = async (): Promise<void> => {
      await view.fixture.whenStable()
    }
    const run = async (): Promise<void> => {
      await user.click(button(/Draft examples⟧$/))
      await waitFor(() => expect(status()).not.toMatch(/Drafting examples/))
      await settle()
      seen.push(...shown(root))
    }

    await user.type(within(root as HTMLElement).getByRole('textbox'), 'anything')
    await settle()
    await run()
    await user.click(button(/Keep names a ghost/))
    await settle()
    seen.push(...shown(root))
    await user.click(button(/Keep nothing asks why/))
    await settle()
    seen.push(...shown(root))
    await user.click(button(/Discard other asks why/))
    await settle()
    seen.push(...shown(root))
    await run()
    await run()
    await run()
    await run()
    await user.click(button(/Draft examples⟧$/))
    await waitFor(() => expect(button(/Stop drafting/)).toBeTruthy())
    seen.push(...shown(root))
    await user.click(button(/Stop drafting/))
    await waitFor(() => expect(status()).toMatch(/Stopped/))
    await settle()
    seen.push(...shown(root))

    expect(untranslated(seen, DRAFTING_WORDS)).toEqual([])
    expect(DRAFTING_REACHED.filter((prefix) => !seen.some((text) => text.includes(prefix)))).toEqual([])
  })
})
