import { afterEach, describe, expect, test } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
import { DECLINE_KEY } from '@formancy/spec'
import type { FormSchema } from '@formancy/spec'
import { FormancyBuilder } from './builder.js'
import { FormancyLayoutPane } from './layout-pane.js'
import { ColumnsEditor } from './columns-editor.js'
import { LayoutPropertyPanel } from './layout-property-panel.js'
import { LogicPanel } from './logic-panel.js'
import { PromptPane } from './prompt-pane.js'
import { ScenarioPane } from './scenario-pane.js'
import { TranslationsPane } from './translations-pane.js'
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

/** The words that are not the builder's to translate: the document's, and the spec's. */
function ownWords(document: FormSchema): string[] {
  return [
    document.title,
    ...flatten(document).map((node) => nameOf(document, node.def)),
    // The palette's type names are NOT here: they are the spec's words, translated
    // through the language's schema and marked like everything else (0121).
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
    const user = userEvent.setup()
    const session = createBuilderSession(ruled, { text: createBuilderText(pseudoLanguage()) })
    const { container } = render(<LogicPanel session={session} keyPath={['canton']} />)
    const seen = shown(container)

    // A draft with two comparisons: the join, the numbered labels, the remove button.
    await user.click(screen.getAllByRole('button').at(-1)!)
    await user.click(
      screen
        .getAllByRole('button')
        .find((button) => button.textContent?.includes('Add a comparison'))!,
    )
    seen.push(...shown(container))
    // A check, and a calculation, each with its own box and example.
    const kind = container.querySelector('select')!
    await user.selectOptions(kind, 'check')
    seen.push(...shown(container))
    await user.selectOptions(kind, 'computed')
    seen.push(...shown(container))

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
    // A report with something written, something unknown and something stale.
    session.importCatalogue({
      locale: 'de',
      defaultLocale: 'en',
      messages: [
        // Stale, and left untranslated, so the row says so.
        { id: 'note.label', source: 'Old note', target: '' },
        { id: 'missing.label', source: 'Missing', target: 'Fehlt' },
      ],
    })
    const { container } = render(<TranslationsPane session={session} />)
    const user = userEvent.setup()
    await user.selectOptions(screen.getByRole('combobox'), 'de')

    // The preview is the FORM, in the renderer's words rather than the builder's —
    // all but its name and its button, which the pane gives it.
    const outside = container.cloneNode(true) as HTMLElement
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

  test('and a form with nothing translatable yet, likewise', () => {
    const plain = {
      ...translated,
      model: { fields: [{ key: 'email', type: 'text', label: 'Email' }] },
      i18n: undefined,
    } as unknown as FormSchema
    const { container } = render(
      <TranslationsPane
        session={createBuilderSession(plain, { text: createBuilderText(pseudoLanguage()) })}
      />,
    )
    const seen = shown(container)

    expect(untranslated(seen, ['Contact', 'Email'])).toEqual([])
    expect(
      ['Nothing in this form', 'Make this form translatable'].filter(
        (prefix) => !seen.some((text) => text.includes(prefix)),
      ),
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
    const user = userEvent.setup()
    // The change list is the spec's diff, in the spec's words.
    const words = [
      ...proposeEdit(start, written).changes.flatMap((change) => [change.path, change.detail]),
      'Name',
      'Email',
    ]

    const good = createBuilderSession(start, { text: createBuilderText(pseudoLanguage()) })
    const first = render(
      <PromptPane session={good} ask={() => Promise.resolve(JSON.stringify(written))} />,
    )
    await user.type(screen.getByRole('textbox'), 'add an email')
    await user.click(screen.getByRole('button'))
    // The review, not "more than one button": while it waits the pane shows Stop too.
    await waitFor(() =>
      expect(document.querySelector('[data-formancy-part="prompt-review"]')).not.toBeNull(),
    )
    const seen = shown(first.container)
    first.unmount()

    // The problems are what the model was told, shown as they were told (0119).
    const failing = (): Promise<string> => Promise.resolve('not json at all')
    const told = await authorForm(failing, 'anything', { attempts: 1 })
    const problems = told.ok ? [] : told.problems.map((problem) => problem.detail)
    const bad = createBuilderSession(start, { text: createBuilderText(pseudoLanguage()) })
    const second = render(<PromptPane session={bad} ask={failing} attempts={1} />)
    await user.type(screen.getByRole('textbox'), 'anything')
    await user.click(screen.getByRole('button'))
    await waitFor(() =>
      expect(document.querySelector('[data-formancy-part="prompt-problems"]')).not.toBeNull(),
    )
    seen.push(...shown(second.container))

    // What the person typed is theirs, in whatever language they typed it.
    expect(untranslated(seen, [...words, ...problems, 'add an email', 'anything'])).toEqual([])
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
    const user = userEvent.setup()

    const waiting = render(<PromptPane session={pseudo()} ask={() => new Promise<string>(() => undefined)} />)
    await user.type(screen.getByRole('textbox'), 'anything')
    await user.click(screen.getByRole('button'))
    await waitFor(() => expect(screen.getAllByRole('button')).toHaveLength(2))
    const seen = shown(waiting.container)
    await user.click(screen.getAllByRole('button')[1]!)
    await waitFor(() => expect(screen.getAllByRole('button')).toHaveLength(1))
    seen.push(...shown(waiting.container))
    waiting.unmount()

    const unreachable = render(
      <PromptPane session={pseudo()} ask={() => Promise.reject(new Error('the host said this'))} />,
    )
    await user.type(screen.getByRole('textbox'), 'anything')
    await user.click(screen.getByRole('button'))
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('the host said this'))
    seen.push(...shown(unreachable.container))

    expect(untranslated(seen, ['anything', 'the host said this'])).toEqual([])
    expect(seen).toContain('⟦Stop⟧')
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
    const session = createBuilderSession(start, { text: createBuilderText(pseudoLanguage()) })
    const user = userEvent.setup()

    const view = render(
      <PromptPane
        session={session}
        ask={() => Promise.resolve(JSON.stringify({ [DECLINE_KEY]: 'the model said this' }))}
      />,
    )
    await user.type(screen.getByRole('textbox'), 'anything')
    await user.click(screen.getByRole('button'))
    await waitFor(() => expect(screen.getByText('the model said this')).toBeTruthy())
    const seen = shown(view.container)

    expect(untranslated(seen, ['anything', 'the model said this'])).toEqual([])
    expect(seen.some((text) => text.includes('declined this request'))).toBe(true)
  })

  test('the prompt pane, with an answer that stops an example holding, likewise', async () => {
    // The review names the examples (0160): their names are the host's, and every word
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
    const session = createBuilderSession(right, { text: createBuilderText(pseudoLanguage()) })
    const user = userEvent.setup()

    const view = render(
      <PromptPane
        session={session}
        ask={() => Promise.resolve(JSON.stringify(backwards))}
        scenarios={[example]}
      />,
    )
    await user.type(screen.getByRole('textbox'), 'invert it')
    await user.click(screen.getByRole('button'))
    await waitFor(() =>
      expect(document.querySelector('[data-formancy-part="prompt-review"]')).not.toBeNull(),
    )
    const seen = shown(view.container)

    expect(untranslated(seen, words)).toEqual([])
    expect(
      ['scenario would stop holding', 'Would stop holding if applied'].filter(
        (prefix) => !seen.some((text) => text.includes(prefix)),
      ),
    ).toEqual([])
  })

  test('the scenario panel, holding and not, and empty, likewise', () => {
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
    // A failure says what was expected and what happened, in the engine's words.
    const failures = runScenarios(form, scenarios).flatMap((result) =>
      result.failures.map((failure) => failure.detail),
    )
    const session = createBuilderSession(form, { text: createBuilderText(pseudoLanguage()) })

    const one = render(
      <ScenarioPane session={session} scenarios={scenarios} onChange={() => undefined} />,
    )
    const seen = shown(one.container)
    one.unmount()
    const none = render(<ScenarioPane session={session} scenarios={[]} />)
    seen.push(...shown(none.container))

    expect(untranslated(seen, [...failures, 'empty is valid', 'reason is hidden'])).toEqual([])
    expect(
      ['Scenarios', 'does not hold', 'Remove empty is valid', 'No scenarios'].filter(
        (prefix) => !seen.some((text) => text.includes(prefix)),
      ),
    ).toEqual([])
  })
})
