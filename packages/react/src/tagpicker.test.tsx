import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createFormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { FormancyForm } from './form.js'
import { FormancyProvider } from './context.js'

/**
 * `widget: "tagpicker"` — several answers, narrowed by typing.
 *
 * A widget and not a field type, because the answer is unchanged: an array of
 * offered option values in the options' own order, which is exactly what a
 * `selectboxes` stores without it. What changes is that a list too long to tick
 * through becomes usable.
 *
 * The keyboard is the whole test here. A tag picker is a combobox with chips,
 * and the two ways it is usually got wrong are a text box that traps focus and a
 * chip that can be added with a pointer and removed only with one.
 */
afterEach(cleanup)

const schema: FormSchema = {
  specVersion: '3',
  id: 'tags',
  title: 'Tags',
  model: {
    fields: [
      {
        key: 'topics',
        type: 'selectboxes',
        label: 'Topics',
        widget: 'tagpicker',
        options: [
          { value: 'a11y', label: 'Accessibility' },
          { value: 'forms', label: 'Forms' },
          { value: 'i18n', label: 'Translation' },
        ],
      },
    ],
  },
}

const mount = (initial?: Record<string, unknown>): ReturnType<typeof createFormEngine> => {
  const engine = createFormEngine({
    schema,
    capabilities: { now: () => 0, today: () => '2026-09-29', random: () => 0.5 },
    ...(initial === undefined ? {} : { initialValue: initial }),
  })
  render(
    <FormancyProvider engine={engine}>
      <FormancyForm onSubmit={() => undefined} />
    </FormancyProvider>,
  )
  return engine
}

const answers = (engine: ReturnType<typeof createFormEngine>): unknown =>
  (engine.value() as Record<string, unknown>).topics

describe('choosing several answers by typing', () => {
  test('narrows the list, and choosing one stores its value', async () => {
    const user = userEvent.setup()
    const engine = mount()

    const box = screen.getByRole('combobox', { name: 'Topics' })
    await user.type(box, 'trans')

    // By label, and the stored answer is the VALUE. A picker that matched values
    // would ask somebody to type `i18n` to find "Translation".
    const offered = screen.getAllByRole('option').map((option) => option.textContent)
    expect(offered).toEqual(['Translation'])

    await user.click(screen.getByRole('option', { name: 'Translation' }))
    expect(answers(engine)).toEqual(['i18n'])
  })

  test('keeps the options’ own order, however they were chosen', async () => {
    const user = userEvent.setup()
    const engine = mount()

    const box = screen.getByRole('combobox', { name: 'Topics' })
    await user.type(box, 'trans')
    await user.click(screen.getByRole('option', { name: 'Translation' }))
    await user.type(box, 'access')
    await user.click(screen.getByRole('option', { name: 'Accessibility' }))

    // Chosen second, stored first: two people choosing the same answers produce
    // the same submission, so a diff of two submissions means something.
    expect(answers(engine)).toEqual(['a11y', 'i18n'])
  })

  test('an answer already chosen is not offered again', async () => {
    const user = userEvent.setup()
    mount({ topics: ['i18n'] })

    await user.type(screen.getByRole('combobox', { name: 'Topics' }), 'a')

    const offered = screen.getAllByRole('option').map((option) => option.textContent)
    expect(offered).not.toContain('Translation')
  })
})

describe('the chips', () => {
  test('name what was chosen, and each can be removed', async () => {
    const user = userEvent.setup()
    const engine = mount({ topics: ['a11y', 'i18n'] })

    const chosen = screen.getByRole('list', { name: /chosen/i })
    expect(within(chosen).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      expect.stringContaining('Accessibility'),
      expect.stringContaining('Translation'),
    ])

    // A remove button per chip, named after the answer it removes: "Remove" three
    // times over tells a screen reader user which nothing.
    await user.click(screen.getByRole('button', { name: /remove accessibility/i }))
    expect(answers(engine)).toEqual(['i18n'])
  })

  test('can be removed with the keyboard alone, which is where this is usually wrong', async () => {
    const user = userEvent.setup()
    const engine = mount({ topics: ['a11y'] })

    // Tab to the remove button and press it. A chip addable by pointer and
    // removable only by pointer is WCAG 2.1.1, and it is the failure this
    // pattern ships with more often than any other.
    await user.tab()
    while (
      document.activeElement?.getAttribute('aria-label')?.toLowerCase().includes('remove') !== true
    ) {
      await user.tab()
      if (document.activeElement === document.body) break
    }
    await user.keyboard('{Enter}')

    expect(answers(engine)).toEqual([])
  })
})

describe('what it says it is', () => {
  test('is a combobox over a listbox, named by the field', () => {
    mount()

    const box = screen.getByRole('combobox', { name: 'Topics' })
    expect(box.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  test('every part a theme has to dress carries its name', () => {
    mount({ topics: ['a11y'] })

    const parts = [...document.querySelectorAll('[data-formancy-part]')].map((element) =>
      element.getAttribute('data-formancy-part'),
    )
    expect(parts).toContain('tagpicker')
    expect(parts).toContain('tagpicker-chips')
    expect(parts).toContain('tagpicker-chip')
    expect(parts).toContain('tagpicker-remove')
  })
})
