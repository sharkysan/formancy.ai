import { provideZonelessChangeDetection } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { afterEach, describe, expect, test } from 'vitest'
import { render, screen, within } from '@testing-library/angular'
import { userEvent } from '@testing-library/user-event'
import {
  BUILDER_MESSAGES_DE,
  createBuilderSession,
  createBuilderText,
  flatten,
  nameOf,
  paletteEntries,
  pseudoLanguage,
  untranslated,
} from '@formancy/builder-core'
import type { BuilderText } from '@formancy/builder-core'
import type { FormSchema } from '@formancy/spec'
import { FormancyBuilder } from './builder'

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
