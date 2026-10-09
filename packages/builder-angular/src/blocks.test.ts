import { provideZonelessChangeDetection } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { afterEach, describe, expect, test } from 'vitest'
import { render, screen, within } from '@testing-library/angular'
import { userEvent } from '@testing-library/user-event'
import { blockFrom, createBuilderSession, createBuilderText } from '@formancy/builder-core'
import type { BuilderBlock } from '@formancy/builder-core'
import type { FormSchema } from '@formancy/spec'
import { FormancyBuilder } from './builder'

/**
 * Blocks in the Angular builder (0135), as the React builder offers them: beside the field
 * types when adding, and saved from the focused field with \`b\` — where the host keeps
 * blocks, which it says by binding \`blocks\`.
 */
afterEach(() => {
  TestBed.resetTestingModule()
  document.body.innerHTML = ''
})

const form: FormSchema = {
  specVersion: '4',
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
} as FormSchema

const postal = (): BuilderBlock => {
  const saved = blockFrom(
    form,
    ['billing'],
    { id: 'postal', name: 'Postal address' },
    createBuilderText(),
  )
  if (!saved.ok) throw new Error(saved.message)
  return saved.block
}

async function mount(inputs: { blocks?: readonly BuilderBlock[] } = {}) {
  const session = createBuilderSession(form)
  const saved: BuilderBlock[] = []
  const view = await render(FormancyBuilder, {
    componentInputs: { session, ...inputs },
    on: { blockSaved: (block: BuilderBlock) => saved.push(block) },
    providers: [provideZonelessChangeDetection()],
  })
  await view.fixture.whenStable()
  const user = userEvent.setup()
  const settle = async (): Promise<void> => void (await view.fixture.whenStable())
  return {
    session,
    saved,
    press: async (keys: string) => {
      await user.keyboard(keys)
      await settle()
    },
    click: async (element: Element) => {
      await user.click(element as HTMLElement)
      await settle()
    },
    type: async (element: Element, value: string) => {
      await user.clear(element as HTMLElement)
      await user.type(element as HTMLElement, value)
      await settle()
    },
    tab: async () => {
      await user.tab()
      await settle()
    },
  }
}

describe('blocks in the Angular builder', () => {
  test('are offered beside the field types, and land where the person chooses', async () => {
    const { session, press, click, tab } = await mount({ blocks: [postal()] })
    await tab()

    await press('a')
    const palette = screen.getByRole('dialog', { name: 'Add a field' })
    expect(within(palette).getByRole('heading', { name: 'Your blocks' })).toBeTruthy()
    await click(within(palette).getByRole('button', { name: 'Postal address' }))
    const where = screen.getByRole('dialog', { name: 'Add the block “Postal address” where?' })
    await click(within(where).getByRole('button', { name: 'Order, after Billing address' }))

    expect(session.document().model.fields.map((field) => field.key)).toEqual([
      'customer',
      'billing',
      'billing2',
    ])
    expect(screen.getByRole('status').textContent).toBe(
      'Added the block “Postal address” to Order, after Billing address.',
    )
  })

  test('with none saved yet, say how to make one', async () => {
    const { press, tab } = await mount({ blocks: [] })
    await tab()

    await press('a')

    expect(
      within(screen.getByRole('dialog', { name: 'Add a field' })).getByText(
        'No blocks yet. Save a field or a group as a block to use it again.',
      ),
    ).toBeTruthy()
  })

  test('b saves the focused field as a block, named by the person, and hands it to the host', async () => {
    const { saved, press, click, type, tab } = await mount({ blocks: [] })
    await tab()
    await press('{ArrowDown}')

    await press('b')
    const dialog = screen.getByRole('dialog', { name: 'Save as a block' })
    const name = within(dialog).getByRole('textbox', { name: 'Block name' })
    expect((name as HTMLInputElement).value).toBe('Billing address')
    await type(name, 'Home address')
    await click(within(dialog).getByRole('button', { name: 'Save block' }))

    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({ name: 'Home address', field: { key: 'billing' } })
    expect(screen.getByRole('status').textContent).toBe('Saved “Home address” as a block.')
  })

  test('and without blocks bound, b is not a command and the help does not name it', async () => {
    const { press, tab } = await mount()
    await tab()

    await press('b')

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByText('save the focused field as a block')).toBeNull()
  })
})
