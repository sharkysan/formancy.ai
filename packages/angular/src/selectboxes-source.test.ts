import { provideZonelessChangeDetection } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { fireEvent, render, screen } from '@testing-library/angular'
import { afterEach, describe, expect, test } from 'vitest'

import { createFormEngine } from '@formancy/core'
import type { FormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'

import { FormancyForm, provideFormancy, provideFormancyOptionsSources } from './index'
import type { OptionsRequest, OptionsSources } from './index'

afterEach(() => {
  TestBed.resetTestingModule()
  document.body.innerHTML = ''
})

/**
 * A list of ticks whose options come from a source (0215) — the React binding's cases, by
 * name. Here the source was asked, twice under a tag picker, and its rows drawn nowhere.
 */
const CANTONS = [
  { value: 'ZH', label: 'Zürich' },
  { value: 'BE', label: 'Bern' },
  { value: 'VD', label: 'Vaud' },
]

async function mount({
  widget,
  sources,
  initialValue,
}: {
  widget?: 'tagpicker'
  sources?: OptionsSources
  initialValue?: Record<string, unknown>
} = {}): Promise<{ engine: FormEngine; settle: () => Promise<void> }> {
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
  const view = await render(FormancyForm, {
    providers: [provideZonelessChangeDetection(), provideFormancy(engine), ...(sources === undefined ? [] : [provideFormancyOptionsSources(sources)])],
  })
  await view.fixture.whenStable()
  return { engine, settle: () => view.fixture.whenStable() }
}

/** Zoneless: nothing re-renders when a promise settles, so each try settles the fixture first. */
async function until(settle: () => Promise<void>, assertion: () => void): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    await settle()
    try {
      assertion()
      return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
  }
  await settle()
  assertion()
}

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
const checked = (name: string): boolean => screen.getByRole<HTMLInputElement>('checkbox', { name }).checked

describe('a list of ticks whose options come from a source', () => {
  test('draws a box for each row the source returned, named by its label', async () => {
    const { sources } = answering()
    const { settle } = await mount({ sources })
    await until(settle, () => expect(boxes()).toEqual(['ZH', 'BE', 'VD']))
    expect(screen.getByRole('checkbox', { name: 'Bern' })).toBeTruthy()
  })

  test('stores every row ticked, in the order ticked', async () => {
    const { sources } = answering()
    const { engine, settle } = await mount({ sources })
    await until(settle, () => expect(boxes()).toHaveLength(3))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Vaud' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Zürich' }))
    expect(engine.value()).toEqual({ cantons: ['VD', 'ZH'] })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Vaud' }))
    expect(engine.value()).toEqual({ cantons: ['ZH'] })
  })

  test('ticks what the form already holds, named by the source, asked once', async () => {
    const { sources, asked } = answering(CANTONS.slice(0, 2))
    const { settle } = await mount({ sources, initialValue: { cantons: ['VD', 'ZH'] } })
    await until(settle, () => expect(screen.getByRole('checkbox', { name: 'Vaud' })).toBeTruthy())
    expect(checked('Vaud')).toBe(true)
    expect(checked('Zürich')).toBe(true)
    expect(checked('Bern')).toBe(false)
    expect(asked.filter((request) => request.kind === 'labels').map((request) => request.values)).toEqual([['VD', 'ZH']])
  })

  test('says what its list leaves out, in a select’s words', async () => {
    const { settle } = await mount({ sources: { cantons: { debounceMs: 0, maxRows: 2, resolve: () => Promise.resolve(CANTONS) } } })
    await until(settle, () => expect(boxes()).toEqual(['ZH', 'BE']))
    expect(screen.getByRole('status').textContent?.trim()).toBe('Showing the first 2 of 3.')
  })

  test('says so instead of an empty group when the deployment has none', async () => {
    await mount()
    expect(screen.queryAllByRole('checkbox')).toEqual([])
    expect(screen.getByText(/answers come from "cantons"/)).toBeTruthy()
  })

  test('says a source that failed in its status region, and asks again from its button', async () => {
    let failing = true
    const asked: OptionsRequest[] = []
    const { settle } = await mount({
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
    await until(settle, () => expect(screen.getByRole('status').textContent?.trim()).toBe('The options could not be loaded.'))
    expect(document.querySelector('[data-formancy-part="error"]')).toBeNull()
    failing = false
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await until(settle, () => expect(boxes()).toEqual(['ZH', 'BE', 'VD']))
    // Kept while the source was asked again, and gone once it answered.
    await until(settle, () => expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull())
    expect(asked.filter((request) => request.kind === 'search')).toHaveLength(2)
  })
})

// The React binding's case: the button stays while its source is asked again, and focus moves to
// the first box once the rows arrive, rather than falling to the page with the button.
test('a list of ticks asking again keeps the focus on its button, and gives it to the first box when the rows arrive', async () => {
  let failing = true
  let answer: (rows: typeof CANTONS) => void = () => undefined
  const { settle } = await mount({
    sources: {
      cantons: {
        debounceMs: 0,
        resolve: () => (failing ? Promise.reject(new Error('down')) : new Promise((resolve) => (answer = resolve))),
      },
    },
  })
  await until(settle, () => expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy())
  const again = screen.getByRole('button', { name: 'Try again' })
  failing = false
  again.focus()
  fireEvent.click(again)
  await until(settle, () => expect(screen.getByRole('group', { name: 'Cantons' }).getAttribute('aria-busy')).toBe('true'))
  expect(document.activeElement).toBe(again)
  answer(CANTONS)
  await until(settle, () => expect(document.activeElement).toBe(screen.getByRole('checkbox', { name: 'Zürich' })))
  await until(settle, () => expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull())
})

describe('a tag picker whose options come from a source', () => {
  test('asks the source what was typed, and offers what it returned', async () => {
    const { sources, asked } = answering()
    const { settle } = await mount({ widget: 'tagpicker', sources })
    // Asked by the control that draws the list, once per search: the dispatcher above the tag
    // picker asked too, with its own empty query, and its answers were read by nobody.
    await until(settle, () => expect(asked.some((request) => request.kind === 'search')).toBe(true))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(asked.filter((request) => request.kind === 'search')).toHaveLength(1)

    fireEvent.input(screen.getByRole('combobox', { name: 'Cantons' }), { target: { value: 'z' } })
    await until(settle, () => expect(asked.some((request) => request.kind === 'search' && request.query === 'z')).toBe(true))
    await until(settle, () => expect(screen.getAllByRole('option').map((option) => option.textContent?.trim())).toEqual(['Zürich', 'Bern', 'Vaud']))
  })

  test('adds a chip named by its row, and stores the value', async () => {
    const { sources } = answering()
    const { engine, settle } = await mount({ widget: 'tagpicker', sources })
    fireEvent.input(screen.getByRole('combobox', { name: 'Cantons' }), { target: { value: 'b' } })
    await until(settle, () => expect(screen.getAllByRole('option')).toHaveLength(3))
    fireEvent.click(screen.getByRole('option', { name: 'Bern' }))
    expect(engine.value()).toEqual({ cantons: ['BE'] })
    await until(settle, () => expect(screen.getByRole('button', { name: 'Remove Bern' })).toBeTruthy())
  })

  test('names the chips of what the form already holds', async () => {
    const { sources, asked } = answering([])
    const { settle } = await mount({ widget: 'tagpicker', sources, initialValue: { cantons: ['VD'] } })
    await until(settle, () => expect(screen.getByRole('button', { name: 'Remove Vaud' })).toBeTruthy())
    expect(asked.filter((request) => request.kind === 'labels').map((request) => request.values)).toEqual([['VD']])
  })

  test('says so instead of a combobox that can never answer when the deployment has none', async () => {
    await mount({ widget: 'tagpicker' })
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.getByText(/answers come from "cantons"/)).toBeTruthy()
  })

  test('says a source that failed in its status region, and asks again on the next keystroke', async () => {
    let failing = true
    const { settle } = await mount({
      widget: 'tagpicker',
      sources: {
        cantons: { debounceMs: 0, resolve: () => (failing ? Promise.reject(new Error('down')) : Promise.resolve(CANTONS)) },
      },
    })
    const box = screen.getByRole('combobox', { name: 'Cantons' })
    fireEvent.input(box, { target: { value: 'z' } })
    await until(settle, () => expect(screen.getByRole('status').textContent?.trim()).toBe('The options could not be loaded. Type to try again.'))
    failing = false
    fireEvent.input(box, { target: { value: 'zu' } })
    await until(settle, () => expect(screen.getAllByRole('option')).toHaveLength(3))
  })
})
