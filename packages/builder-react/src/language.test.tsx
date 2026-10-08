import { afterEach, describe, expect, test } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
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
import type { FormSchema } from '@formancy/spec'
import { FormancyBuilder } from './builder.js'

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
