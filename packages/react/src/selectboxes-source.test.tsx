import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'

import { createFormEngine } from '@formancy/core'
import type { FormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'

import { FormancyForm, FormancyProvider, OptionsSourcesProvider } from './index.js'
import type { OptionsRequest, OptionsSources } from './index.js'

afterEach(cleanup)

/**
 * A list of ticks whose options come from a source (0215).
 *
 * The format let a `selectboxes` name a source from spec 3, and the server checks every value
 * in one, but neither renderer drew the source's rows: the tick boxes were an empty group, the
 * tag picker a combobox with nothing in its list, and a tick stored nothing, since `ticked`
 * kept only what the document listed. The same cases, by name, in the Angular binding.
 */
const WAITING = { timeout: 5_000 }

const CANTONS = [
  { value: 'ZH', label: 'Zürich' },
  { value: 'BE', label: 'Bern' },
  { value: 'VD', label: 'Vaud' },
]

function mount({
  widget,
  sources,
  initialValue,
}: {
  widget?: 'tagpicker'
  sources?: OptionsSources
  initialValue?: Record<string, unknown>
} = {}): FormEngine {
  const schema: FormSchema = {
    specVersion: '3',
    id: 'sourced-ticks',
    title: 'Sourced ticks',
    model: {
      fields: [
        {
          key: 'cantons',
          type: 'selectboxes',
          label: 'Cantons',
          optionsSource: 'cantons',
          ...(widget === undefined ? {} : { widget }),
        },
      ],
    },
  }
  const engine = createFormEngine({ schema, ...(initialValue === undefined ? {} : { initialValue }) })
  const form = <FormancyForm onSubmit={() => undefined} />
  render(
    <FormancyProvider engine={engine}>
      {sources === undefined ? form : <OptionsSourcesProvider value={sources}>{form}</OptionsSourcesProvider>}
    </FormancyProvider>,
  )
  return engine
}

/** A source answering every search with `rows` and every labels request from `named`. */
const answering = (rows = CANTONS, named = CANTONS): { sources: OptionsSources; asked: OptionsRequest[] } => {
  const asked: OptionsRequest[] = []
  return {
    asked,
    sources: {
      cantons: {
        debounceMs: 0,
        resolve: (request) => {
          asked.push(request)
          return Promise.resolve(request.kind === 'labels' ? named.filter((row) => request.values.includes(row.value)) : rows)
        },
      },
    },
  }
}

const boxes = (): string[] => screen.queryAllByRole('checkbox').map((box) => box.getAttribute('value') ?? '')

describe('a list of ticks whose options come from a source', () => {
  test('draws a box for each row the source returned, named by its label', async () => {
    const { sources } = answering()
    mount({ sources })
    await waitFor(() => expect(boxes()).toEqual(['ZH', 'BE', 'VD']), WAITING)
    expect(screen.getByRole('checkbox', { name: 'Bern' })).toBeTruthy()
  })

  // A source has no written order, so the answer keeps the order the person ticked in, and a
  // tick stores something: the written order it was read in kept nothing.
  test('stores every row ticked, in the order ticked', async () => {
    const { sources } = answering()
    const engine = mount({ sources })
    await waitFor(() => expect(boxes()).toHaveLength(3), WAITING)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Vaud' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Zürich' }))
    expect(engine.value()).toEqual({ cantons: ['VD', 'ZH'] })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Vaud' }))
    expect(engine.value()).toEqual({ cantons: ['ZH'] })
  })

  // A resumed draft holds values the source's first rows may not include; dropped, they would
  // look unticked, and the next tick would store a list without them.
  test('ticks what the form already holds, named by the source, asked once', async () => {
    const { sources, asked } = answering(CANTONS.slice(0, 2))
    mount({ sources, initialValue: { cantons: ['VD', 'ZH'] } })
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Vaud' })).toBeTruthy(), WAITING)
    const vaud = screen.getByRole<HTMLInputElement>('checkbox', { name: 'Vaud' })
    expect(vaud.checked).toBe(true)
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'Zürich' }).checked).toBe(true)
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'Bern' }).checked).toBe(false)
    expect(asked.filter((request) => request.kind === 'labels').map((request) => request.values)).toEqual([['VD', 'ZH']])
  })

  // A cut list must not look like the whole one (hazard A7a): said in a select's words, since
  // nobody types into a list of ticks either.
  test('says what its list leaves out, in a select’s words', async () => {
    mount({ sources: { cantons: { debounceMs: 0, maxRows: 2, resolve: () => Promise.resolve(CANTONS) } } })
    await waitFor(() => expect(boxes()).toEqual(['ZH', 'BE']), WAITING)
    expect(screen.getByRole('status').textContent).toBe('Showing the first 2 of 3.')
  })

  test('says so instead of an empty group when the deployment has none', () => {
    mount()
    expect(screen.queryAllByRole('checkbox')).toEqual([])
    expect(screen.getByText(/answers come from "cantons"/)).toBeTruthy()
  })

  // A failed list may have no box to move to, so it is asked again from a button, and the
  // failure is a status, never the field's error.
  test('says a source that failed in its status region, and asks again from its button', async () => {
    let failing = true
    const asked: OptionsRequest[] = []
    mount({
      sources: {
        cantons: {
          debounceMs: 0,
          resolve: (request) => {
            asked.push(request)
            return failing ? Promise.reject(new Error('down')) : Promise.resolve(CANTONS)
          },
        },
      },
    })
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('The options could not be loaded.'), WAITING)
    expect(document.querySelector('[data-formancy-part="error"]')).toBeNull()
    failing = false
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(boxes()).toEqual(['ZH', 'BE', 'VD']), WAITING)
    // Kept while the source was asked again, and gone once it answered.
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull(), WAITING)
    expect(asked.filter((request) => request.kind === 'search')).toHaveLength(2)
  })
})

// The button goes once its source answers, and focus on a removed element falls to the page,
// where a screen reader says nothing, since success is not announced.
test('a list of ticks asking again keeps the focus on its button, and gives it to the first box when the rows arrive', async () => {
  let failing = true
  let answer: (rows: typeof CANTONS) => void = () => undefined
  mount({
    sources: {
      cantons: {
        debounceMs: 0,
        resolve: () => (failing ? Promise.reject(new Error('down')) : new Promise((resolve) => (answer = resolve))),
      },
    },
  })
  const again = await screen.findByRole('button', { name: 'Try again' }, WAITING)
  failing = false
  again.focus()
  fireEvent.click(again)
  await waitFor(() => expect(screen.getByRole('group', { name: 'Cantons' }).getAttribute('aria-busy')).toBe('true'), WAITING)
  expect(document.activeElement).toBe(again)
  answer(CANTONS)
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('checkbox', { name: 'Zürich' })), WAITING)
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull(), WAITING)
})

describe('a tag picker whose options come from a source', () => {
  // The source is the authority on what matches: it is handed the query, and its rows are
  // not narrowed again by their labels.
  test('asks the source what was typed, and offers what it returned', async () => {
    const { sources, asked } = answering()
    mount({ widget: 'tagpicker', sources })
    // Asked by the control that draws the list, once per search, as in the Angular binding.
    await waitFor(() => expect(asked.some((request) => request.kind === 'search')).toBe(true), WAITING)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(asked.filter((request) => request.kind === 'search')).toHaveLength(1)

    fireEvent.change(screen.getByRole('combobox', { name: 'Cantons' }), { target: { value: 'z' } })
    await waitFor(() => expect(asked.some((request) => request.kind === 'search' && request.query === 'z')).toBe(true), WAITING)
    await waitFor(() => expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['Zürich', 'Bern', 'Vaud']), WAITING)
  })

  test('adds a chip named by its row, and stores the value', async () => {
    const { sources } = answering()
    const engine = mount({ widget: 'tagpicker', sources })
    fireEvent.change(screen.getByRole('combobox', { name: 'Cantons' }), { target: { value: 'b' } })
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(3), WAITING)
    fireEvent.click(screen.getByRole('option', { name: 'Bern' }))
    expect(engine.value()).toEqual({ cantons: ['BE'] })
    expect(screen.getByRole('button', { name: 'Remove Bern' })).toBeTruthy()
  })

  test('names the chips of what the form already holds', async () => {
    const { sources, asked } = answering([])
    mount({ widget: 'tagpicker', sources, initialValue: { cantons: ['VD'] } })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Remove Vaud' })).toBeTruthy(), WAITING)
    expect(asked.filter((request) => request.kind === 'labels').map((request) => request.values)).toEqual([['VD']])
  })

  test('says so instead of a combobox that can never answer when the deployment has none', () => {
    mount({ widget: 'tagpicker' })
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.getByText(/answers come from "cantons"/)).toBeTruthy()
  })

  // Typing is how a tag picker asks again, as a typeahead does.
  test('says a source that failed in its status region, and asks again on the next keystroke', async () => {
    let failing = true
    mount({
      widget: 'tagpicker',
      sources: {
        cantons: { debounceMs: 0, resolve: () => (failing ? Promise.reject(new Error('down')) : Promise.resolve(CANTONS)) },
      },
    })
    const box = screen.getByRole('combobox', { name: 'Cantons' })
    fireEvent.change(box, { target: { value: 'z' } })
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('The options could not be loaded. Type to try again.'), WAITING)
    failing = false
    fireEvent.change(box, { target: { value: 'zu' } })
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(3), WAITING)
  })
})
