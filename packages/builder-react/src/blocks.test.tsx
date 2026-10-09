import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { blockFrom, createBuilderSession, createBuilderText } from '@formancy/builder-core'
import type { BuilderBlock } from '@formancy/builder-core'
import type { FormSchema } from '@formancy/spec'
import { FormancyBuilder } from './builder.js'

/**
 * Blocks in the React builder (0135): offered beside the field types when adding, and
 * saved from the focused field with a key — both the host's, which keeps them.
 */
afterEach(cleanup)

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

describe('blocks in the builder', () => {
  test('are offered beside the field types, and land where the person chooses', async () => {
    const user = userEvent.setup()
    const session = createBuilderSession(form)
    render(<FormancyBuilder session={session} blocks={[postal()]} />)
    await user.tab()

    await user.keyboard('a')
    const palette = screen.getByRole('dialog', { name: 'Add a field' })
    expect(within(palette).getByRole('heading', { name: 'Your blocks' })).toBeTruthy()
    await user.click(within(palette).getByRole('button', { name: 'Postal address' }))
    const where = screen.getByRole('dialog', { name: 'Add the block “Postal address” where?' })
    await user.click(within(where).getByRole('button', { name: 'Order, after Billing address' }))

    // A second billing group, renamed so the form's keys stay unique.
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
    const user = userEvent.setup()
    render(
      <FormancyBuilder session={createBuilderSession(form)} blocks={[]} onSaveBlock={() => {}} />,
    )
    await user.tab()

    await user.keyboard('a')

    expect(
      within(screen.getByRole('dialog', { name: 'Add a field' })).getByText(
        'No blocks yet. Save a field or a group as a block to use it again.',
      ),
    ).toBeTruthy()
  })

  test('b saves the focused field as a block, named by the person, and hands it to the host', async () => {
    const user = userEvent.setup()
    const saved = vi.fn<(block: BuilderBlock) => void>()
    render(<FormancyBuilder session={createBuilderSession(form)} onSaveBlock={saved} />)
    await user.tab()
    await user.keyboard('{ArrowDown}')

    await user.keyboard('b')
    const dialog = screen.getByRole('dialog', { name: 'Save as a block' })
    const name = within(dialog).getByRole('textbox', { name: 'Block name' })
    // Starts as the field's own name, which is usually what the block is.
    expect((name as HTMLInputElement).value).toBe('Billing address')
    await user.clear(name)
    await user.type(name, 'Home address')
    await user.click(within(dialog).getByRole('button', { name: 'Save block' }))

    expect(saved).toHaveBeenCalledTimes(1)
    expect(saved.mock.calls[0]?.[0]).toMatchObject({
      name: 'Home address',
      field: { key: 'billing' },
    })
    expect(screen.getByRole('status').textContent).toBe('Saved “Home address” as a block.')
  })

  test('and without a host keeping blocks, b is not a command and the help does not name it', async () => {
    const user = userEvent.setup()
    render(<FormancyBuilder session={createBuilderSession(form)} />)
    await user.tab()

    await user.keyboard('b')

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByText('save the focused field as a block')).toBeNull()
  })
})
