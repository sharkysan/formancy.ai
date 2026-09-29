import { provideZonelessChangeDetection } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { afterEach, describe, expect, test } from 'vitest'
import { render, screen, within } from '@testing-library/angular'
import { userEvent } from '@testing-library/user-event'
import { createBuilderSession, paletteEntries } from '@formancy/builder-core'
import type { BuilderSession } from '@formancy/builder-core'
import type { FormSchema } from '@formancy/spec'
import { FormancyBuilder } from './builder'

/**
 * The structure tree, which must behave as the React one does.
 *
 * The same assertions as `packages/builder-react/src/builder.test.tsx`, by role
 * and accessible name — the restriction [0034](../../../docs/decisions/0034-accessible-name-only.md)
 * puts on the conformance drivers, applied here for the same reason. A builder
 * whose tree cannot be queried by role and name is one a screen reader cannot
 * use, so the query style is the accessibility contract rather than a testing
 * preference.
 *
 * The conformance fixtures cannot carry these: their vocabulary is filling in
 * and clicking on a rendered FORM, and there is no way to say "press `m` and
 * choose a destination" in it. So the parity is held here, deliberately and by
 * hand, exactly as the renderers hold the signature control.
 */
afterEach(() => {
  TestBed.resetTestingModule()
  document.body.innerHTML = ''
})

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

interface Mounted {
  session: BuilderSession
  /** A keystroke, with the render it causes awaited. */
  press(keys: string): Promise<void>
  /** A click, likewise. */
  click(element: Element): Promise<void>
  /** Tab into the tree. */
  tab(): Promise<void>
}

/**
 * Mount the builder, and flush after every interaction.
 *
 * Zoneless Angular runs effects on a change-detection cycle, and `userEvent`
 * knows nothing about Angular's scheduler — so a keystroke set the signal and
 * the effect that moves focus had not run by the time the assertion read
 * `document.activeElement`. React's testing library does this inside `act`; here
 * it is said out loud, which is the honest version: the component is idiomatic
 * and the test waits for the framework rather than the component working around
 * the test.
 */
const mount = async (form: FormSchema = schema): Promise<Mounted> => {
  const session = createBuilderSession(form)
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
    press: async (keys) => {
      await user.keyboard(keys)
      await settle()
    },
    click: async (element) => {
      await user.click(element as HTMLElement)
      await settle()
    },
    tab: async () => {
      await user.tab()
      await settle()
    },
  }
}

const keys = (): string[] =>
  screen.getAllByRole('treeitem').map((item) => item.textContent?.trim() ?? '')

/** A dialog's choices, which are its buttons minus the way out of it. */
const choices = (dialog: HTMLElement): HTMLElement[] =>
  within(dialog)
    .getAllByRole('button')
    .filter((button) => !/cancel/i.test(button.textContent ?? ''))

describe('the structure tree', () => {
  test('is one tab stop, not one per field', async () => {
    const { press, tab, click } = await mount()

    await tab()

    // A hundred-field form must not cost a hundred tabs to get past. Roving
    // tabindex: exactly one item is reachable, and arrows do the rest.
    expect(screen.getAllByRole('treeitem').filter((item) => item.tabIndex === 0)).toHaveLength(1)
    expect(document.activeElement?.textContent?.trim()).toBe('Customer')
  })

  test('arrows walk it in the order a person reads the form', async () => {
    const { press, tab, click } = await mount()
    await tab()

    await press('{ArrowDown}')
    expect(document.activeElement?.textContent?.trim()).toBe('Billing address')

    await press('{ArrowDown}')
    expect(document.activeElement?.textContent?.trim()).toBe('Street')

    await press('{ArrowUp}')
    expect(document.activeElement?.textContent?.trim()).toBe('Billing address')
  })

  test('lists a container before what is inside it, with the depth said out loud', async () => {
    const { press, tab, click } = await mount()

    expect(keys()).toEqual(['Customer', 'Billing address', 'Street', 'City'])
    // `aria-level` is how a screen reader announces nesting; indentation is not.
    const levels = screen.getAllByRole('treeitem').map((item) => item.getAttribute('aria-level'))
    expect(levels).toEqual(['1', '1', '2', '2'])
  })

  test('Home and End go to the ends, because a long form is a long walk', async () => {
    const { press, tab, click } = await mount()
    await tab()

    await press('{End}')
    expect(document.activeElement?.textContent?.trim()).toBe('City')

    await press('{Home}')
    expect(document.activeElement?.textContent?.trim()).toBe('Customer')
  })

  test('Delete removes the focused field and says so', async () => {
    const { session, press, tab, click } = await mount()
    await tab()

    await press('{Delete}')

    expect(session.document().model.fields.map((field) => field.key)).toEqual(['billing'])
    expect(screen.getByRole('status').textContent).toMatch(/removed/i)
  })

  test('and a refusal is announced rather than swallowed', async () => {
    // Every command here reports through one live region. A command that failed
    // silently would leave somebody pressing the key again.
    const { press, tab, click } = await mount()
    await tab()

    await press('u')

    expect(screen.getByRole('status').textContent).toMatch(/nothing inside/i)
  })

  test('Ctrl+Z undoes, and Ctrl+Y puts it back', async () => {
    const { session, press, tab, click } = await mount()
    await tab()
    await press('{Delete}')

    await press('{Control>}z{/Control}')
    expect(session.document().model.fields.map((field) => field.key)).toEqual([
      'customer',
      'billing',
    ])

    await press('{Control>}y{/Control}')
    expect(session.document().model.fields.map((field) => field.key)).toEqual(['billing'])
  })

  test('the tree keeps the keyboard after a command, or the next key goes nowhere', async () => {
    // Removing the focused row detaches it from the document and focus falls to
    // <body>. Without putting it back the tree silently stops responding, which
    // is the defect the React builder has a flag for.
    const { press, tab, click } = await mount()
    await tab()

    await press('{Delete}')

    expect(document.activeElement?.getAttribute('role')).toBe('treeitem')
  })
})

describe('adding a field', () => {
  test('a opens a palette of types, described rather than listed', async () => {
    const { press, tab, click } = await mount()
    await tab()

    await press('a')

    const palette = screen.getByRole('dialog', { name: /add a field/i })
    // Every type the document's spec version allows, derived rather than counted
    // here: a palette that quietly shrank would otherwise still pass a number.
    expect(choices(palette).length).toBeGreaterThanOrEqual(paletteEntries('1').length)
  })

  test('and choosing one then a destination inserts it there', async () => {
    const { session, press, tab, click } = await mount()
    await tab()
    await press('a')

    // The first type the palette offers, whatever it is called: the names come
    // from the spec's own titles and this case is about the two steps, not about
    // which word the first one uses.
    await click(choices(screen.getByRole('dialog'))[0]!)
    // The second step: where it goes, in words rather than as an index.
    await click(choices(screen.getByRole('dialog'))[0]!)

    expect(session.document().model.fields.length).toBe(3)
    expect(screen.getByRole('status').textContent).toMatch(/added/i)
  })

  test('Escape leaves the palette without adding anything', async () => {
    const { session, press, tab, click } = await mount()
    await tab()
    await press('a')

    await press('{Escape}')

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(session.document().model.fields.length).toBe(2)
    // And the keyboard comes back to the tree rather than being left in a
    // dialog that is gone.
    expect(document.activeElement?.getAttribute('role')).toBe('treeitem')
  })
})

describe('moving a field', () => {
  test('m offers every destination as a sentence, not as a number', async () => {
    const { press, tab, click } = await mount()
    await tab()

    await press('m')

    const dialog = screen.getByRole('dialog', { name: /move/i })
    const labels = choices(dialog).map((button) => button.textContent?.trim() ?? '')
    expect(labels.length).toBeGreaterThan(0)
    for (const label of labels) expect(label).not.toMatch(/^\d+$/)
  })

  test('and choosing one moves the field, which is the keyboard half of a drag', async () => {
    // WCAG 2.2 SC 2.5.7: the keyboard path has to do the same job as the
    // pointer, not a reduced one. It was built first here for that reason.
    const { session, press, tab, click } = await mount()
    await tab()
    await press('m')

    const dialog = screen.getByRole('dialog', { name: /move/i })
    await click(choices(dialog).at(-1)!)

    expect(session.document().model.fields.map((field) => field.key)).not.toEqual([
      'customer',
      'billing',
    ])
    expect(screen.getByRole('status').textContent).toMatch(/moved/i)
  })

  test('and a field with nowhere legal to go is told so, rather than shown an empty dialog', async () => {
    const { press, tab, click } = await mount({
      specVersion: '1',
      id: 'one',
      title: 'One',
      model: { fields: [{ key: 'only', type: 'text', label: 'Only' }] },
    })
    await tab()

    await press('m')

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('status').textContent).toMatch(/cannot be moved/i)
  })
})

describe('making and unmaking a wizard', () => {
  test('p makes the form a wizard and says what it did to the fields', async () => {
    const { session, press, tab, click } = await mount()
    await tab()

    await press('p')

    const fields = session.document().model.fields
    expect(fields.map((field) => field.type)).toEqual(['page'])
    expect(fields[0]?.fields?.map((field) => field.key)).toEqual(['customer', 'billing'])
    expect(screen.getByRole('status').textContent).toMatch(/2 fields|two fields/i)
  })

  test('u takes the page away again and keeps the questions', async () => {
    const { session, press, tab, click } = await mount()
    await tab()
    await press('p')
    await press('{Home}')

    await press('u')

    expect(session.document().model.fields.map((field) => field.key)).toEqual([
      'customer',
      'billing',
    ])
    expect(screen.getByRole('status').textContent).toMatch(/wizard/i)
  })
})

describe('what the tree says it is', () => {
  test('every shortcut is listed, so it can be found without being told', async () => {
    const { press, tab, click } = await mount()

    // The legend is how somebody discovers `m` and `Delete`. A command missing
    // from it is a command only its author knows about.
    for (const key of ['a', 'm', 'p', 'u', 'Delete']) {
      expect(screen.getByText(key), `no legend entry for ${key}`).toBeTruthy()
    }
  })

  test("and carries the part names a theme dresses, with the React builder spelling", async () => {
    const { press, tab, click } = await mount()

    const parts = [...document.querySelectorAll('[data-formancy-part]')].map((element) =>
      element.getAttribute('data-formancy-part'),
    )
    for (const part of ['builder', 'builder-tree', 'builder-node', 'builder-keys']) {
      expect(parts, `no ${part}`).toContain(part)
    }
  })
})
