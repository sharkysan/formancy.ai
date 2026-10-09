import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createFormEngine } from '@formancy/core'
import { validateSchema } from '@formancy/spec/validate'
import { createBuilderText, withBlock } from '@formancy/builder-core'
import { App } from './app.js'
import { DEMO_BLOCKS } from './demo-blocks.js'
import { STARTER_SCHEMA } from './starter.js'

/**
 * Blocks, where a visitor can reach them
 * ([0135](../../../docs/decisions/0135-a-block-is-a-field-with-its-rules.md)).
 *
 * Both builders had the palette section and the `b` command, tested in jsdom against a
 * form of their own — and a feature in a package that no application offers is the
 * documented-but-inert failure this repository has shipped before. So the page keeps a
 * list, starts it with a demo block, and hands it to both builders.
 */
vi.mock('@monaco-editor/react', () => ({
  default: ({ value }: { value?: string }) => (
    <textarea aria-label="Schema" value={value ?? ''} readOnly />
  ),
  useMonaco: () => null,
}))

afterEach(cleanup)

const CLOCK = { now: () => 0, today: () => '2026-10-09', random: () => 0.5 }

describe('the demo block', () => {
  test('lands in the starter with its keys made unique, and its rule follows them', () => {
    // The starter already has a country, a canton, a postcode and a town — which is why
    // this block was chosen. Inserted with its own keys the document would be invalid;
    // renamed without its rule, the canton would show for every country.
    const outcome = withBlock(
      STARTER_SCHEMA,
      { parent: [], index: STARTER_SCHEMA.model.fields.length },
      DEMO_BLOCKS[0]!,
      createBuilderText(),
    )
    if (!outcome.ok) throw new Error(outcome.message)

    expect(validateSchema(outcome.document)).toMatchObject({ valid: true })
    expect(outcome.document.model.fields.at(-1)?.fields?.map((field) => field.key)).toEqual([
      'street',
      'postcode2',
      'city2',
      'country2',
      'canton2',
    ])

    const engine = createFormEngine({ schema: outcome.document, capabilities: CLOCK })
    expect(engine.getFieldSnapshot(['billing', 'canton2']).visible).toBe(false)
    engine.setValue(['billing', 'country2'], 'CH')
    expect(engine.getFieldSnapshot(['billing', 'canton2']).visible).toBe(true)
    // Its words came with it, in every language the playground switches between.
    expect(outcome.document.i18n?.messages.de?.billing).toBe('Rechnungsadresse')
  })
})

/** Open the Build pane, then choose which builder is on screen. */
const builtWith = async (which: 'react' | 'angular'): Promise<void> => {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Build' }))
  await user.selectOptions(screen.getByRole('combobox', { name: 'Builder' }), which)
}

/** The builder on screen's tree — the last one, since the Angular one mounts late. */
const tree = async (): Promise<HTMLElement> =>
  waitFor(() => screen.getAllByRole('tree', { name: /structure/i }).at(-1)!, { timeout: 10_000 })

describe('blocks in the playground', () => {
  test('the React builder offers the demo block, and inserts it', async () => {
    const user = userEvent.setup()
    render(<App />)
    await builtWith('react')

    await user.click(within(await tree()).getAllByRole('treeitem')[0]!)
    await user.keyboard('a')
    const palette = screen.getByRole('dialog', { name: 'Add a field' })
    await user.click(within(palette).getByRole('button', { name: 'Address' }))
    const where = screen.getByRole('dialog', { name: 'Add the block “Address” where?' })
    await user.click(within(where).getAllByRole('button')[0]!)

    await waitFor(() => {
      expect(
        within(screen.getAllByRole('tree', { name: /structure/i })[0]!)
          .getAllByRole('treeitem')
          .some((item) => item.textContent?.includes('Billing address')),
      ).toBe(true)
    })
  })

  test('and a block saved in one builder is offered by the other', async () => {
    // The page keeps one list for both, as there is one session for both: a block saved
    // in the React tree that the Angular palette did not offer would be two libraries.
    const user = userEvent.setup()
    render(<App />)
    await builtWith('react')

    await user.click(within(await tree()).getAllByRole('treeitem')[0]!)
    await user.keyboard('b')
    const dialog = screen.getByRole('dialog', { name: 'Save as a block' })
    const name = within(dialog).getByRole('textbox', { name: 'Block name' })
    await user.clear(name)
    await user.type(name, 'Greeting')
    await user.click(within(dialog).getByRole('button', { name: 'Save block' }))

    await builtWith('angular')
    await waitFor(() => expect(screen.getAllByRole('tree', { name: /structure/i })).toHaveLength(1))
    const angular = await tree()
    await user.click(within(angular).getAllByRole('treeitem')[0]!)
    await user.keyboard('a')

    const palette = await waitFor(() => screen.getByRole('dialog', { name: 'Add a field' }))
    expect(within(palette).getByRole('button', { name: 'Greeting' })).toBeTruthy()
    expect(within(palette).getByRole('button', { name: 'Address' })).toBeTruthy()
  })

  test('and the other way round: saved in the Angular tree, offered by the React one', async () => {
    // The Angular builder hands a saved block to the page through an output, across the
    // bootstrap boundary; nothing else would say that crossing had been dropped.
    const user = userEvent.setup()
    render(<App />)
    await builtWith('angular')
    await waitFor(() => expect(screen.getAllByRole('tree', { name: /structure/i })).toHaveLength(1))
    await user.click(within(await tree()).getAllByRole('treeitem')[0]!)
    await user.keyboard('b')
    const dialog = await waitFor(() => screen.getByRole('dialog', { name: 'Save as a block' }))
    const name = within(dialog).getByRole('textbox', { name: 'Block name' })
    await user.clear(name)
    await user.type(name, 'Welcome')
    await user.click(within(dialog).getByRole('button', { name: 'Save block' }))

    await builtWith('react')
    await user.click(within(await tree()).getAllByRole('treeitem')[0]!)
    await user.keyboard('a')

    const palette = screen.getByRole('dialog', { name: 'Add a field' })
    expect(within(palette).getByRole('button', { name: 'Welcome' })).toBeTruthy()
  })
})
