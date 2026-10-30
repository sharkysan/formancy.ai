import { provideZonelessChangeDetection } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { fireEvent, render, screen, waitFor } from '@testing-library/angular'
import { afterEach, describe, expect, test } from 'vitest'

import axe from 'axe-core'
import { ACCESSIBILITY_EXCLUSIONS, ACCESSIBILITY_TAGS, ACCESSIBILITY_UNMEASURABLE_IN_JSDOM } from '@formancy/conformance'
import { createFormEngine } from '@formancy/core'
import type { FormEngine } from '@formancy/core'
import { createFormText } from '@formancy/core/words'
import type { FormSchema } from '@formancy/spec'

import { FormancyForm, provideFormancy, provideFormancyOptionsSources } from './index'
import type { OptionsRequest, OptionsSources } from './index'

afterEach(() => {
  TestBed.resetTestingModule()
  document.body.innerHTML = ''
})

const CLOCK = { now: () => 0, today: () => '2026-09-27', random: () => 0.5 }

/**
 * `optionsSource` in Angular — the same assertions the React file makes.
 *
 * Deliberately a near-copy rather than a shared helper: two renderers agreeing is
 * the claim this repository rests on, and the way it stops being true is one of them
 * quietly not implementing something while a shared abstraction reports that both
 * did. What IS shared is `acceptRemoteAnswer` in `@formancy/spec`, because a rule
 * that took a row here and refused it in React would be two forms from one document,
 * and `optionsStatus` in `@formancy/core/words`, because one state said two ways would
 * be two forms from one source (0177). These cases hold the binding to them: that it
 * asks, holds and resets as they assume, and passes them what is true of the control.
 */
function schema(widget?: 'typeahead', { before = [], rules }: { before?: unknown[]; rules?: unknown[] } = {}): FormSchema {
  return {
    specVersion: '2',
    id: 'sourced',
    title: 'Sourced',
    model: {
      fields: [
        ...before,
        {
          key: 'canton',
          type: 'select',
          label: 'Canton',
          optionsSource: 'cantons',
          ...(widget === undefined ? {} : { widget }),
        },
      ],
    },
    ...(rules === undefined ? {} : { logic: { rules } }),
  } as unknown as FormSchema
}

const CANTONS = [
  { value: 'ZH', label: 'Zürich' },
  { value: 'BE', label: 'Bern' },
  { value: 'VD', label: 'Vaud' },
]

const answering = (rows = CANTONS): { sources: OptionsSources; asked: OptionsRequest[] } => {
  const asked: OptionsRequest[] = []
  return {
    asked,
    sources: {
      cantons: {
        debounceMs: 0,
        resolve: (request) => {
          asked.push(request)
          return Promise.resolve(request.kind === 'labels' ? rows.filter((row) => request.values.includes(row.value)) : rows)
        },
      },
    },
  }
}

async function mount({
  widget,
  sources,
  initialValue,
  locale,
  before,
  rules,
}: {
  widget?: 'typeahead'
  sources?: OptionsSources
  initialValue?: Record<string, unknown>
  locale?: string
  /** Fields ahead of the sourced one, for a rule to read. */
  before?: unknown[]
  rules?: unknown[]
} = {}): Promise<{ engine: FormEngine; settle: () => Promise<void> }> {
  const engine = createFormEngine({
    schema: schema(widget, { ...(before === undefined ? {} : { before }), ...(rules === undefined ? {} : { rules }) }),
    capabilities: CLOCK,
    ...(initialValue === undefined ? {} : { initialValue }),
    ...(locale === undefined ? {} : { locale }),
  })
  const view = await render(FormancyForm, {
    providers: [provideZonelessChangeDetection(), provideFormancy(engine), ...(sources === undefined ? [] : [provideFormancyOptionsSources(sources)])],
  })
  await view.fixture.whenStable()
  return { engine, settle: () => view.fixture.whenStable() }
}

/**
 * Poll until an assertion holds, flushing Angular between tries.
 *
 * `waitFor` alone is not enough here: this application is zoneless, so nothing
 * re-renders on its own when a promise settles, and an assertion that never sees the
 * new DOM would time out against a control that is working perfectly.
 */
async function until(settle: () => Promise<void>, assertion: () => void): Promise<void> {
  // 100 tries at 20ms is two seconds of polling: this control is asynchronous by
  // design, and on a loaded CI runner a shorter budget makes a busy machine look like
  // a broken control.
  for (let attempt = 0; attempt < 100; attempt += 1) {
    await settle()
    try {
      assertion()
      return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
  }
  // One last try, so the failure message is the assertion's own rather than a timeout.
  await settle()
  assertion()
}

describe('a select whose options come from a source', () => {
  test('says so instead of rendering an empty chooser when the deployment has none', async () => {
    // The whole field, not a missing affordance: a select with no options collects
    // nothing, so this is the file field's message rather than the scanner's silence.
    await mount()

    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.getByText(/answers come from "cantons"/)).toBeDefined()
  })

  test('offers what the source returned', async () => {
    const { sources } = answering()
    const { settle } = await mount({ sources })

    await until(settle, () => {
      expect(screen.getAllByRole('option').map((option) => option.textContent?.trim())).toEqual(['', 'Zürich', 'Bern', 'Vaud'])
    })
  })

  test('asks in the locale the engine resolves text in, not the document default', async () => {
    const { sources, asked } = answering()
    await mount({ sources, locale: 'fr' })

    await waitFor(() => {
      expect(asked[0]?.locale).toBe('fr')
    })
    expect(asked[0]?.source).toBe('cantons')
  })

  test('stores the option value, exactly as a listed option would', async () => {
    const { sources } = answering()
    const { engine, settle } = await mount({ sources })

    await until(settle, () => {
      expect(screen.getAllByRole('option')).toHaveLength(4)
    })
    fireEvent.change(screen.getByRole('combobox', { name: 'Canton' }), { target: { value: 'BE' } })
    await settle()

    expect(engine.value()).toEqual({ canton: 'BE' })
  })

  test('refuses the whole list when one row is unusable', async () => {
    const { sources } = answering([{ value: 'ZH', label: 'Zürich' }, { value: 'BE' }] as never)
    const { settle } = await mount({ sources })

    await until(settle, () => {
      expect(screen.getByText(/could not be loaded/)).toBeDefined()
    })
    expect(screen.getAllByRole('option')).toHaveLength(1)
  })

  test('a source that rejects is reported in the status region, never as an error', async () => {
    const { settle } = await mount({
      sources: { cantons: { debounceMs: 0, resolve: () => Promise.reject(new Error('down')) } },
    })

    await until(settle, () => {
      expect(screen.getByText(/The options could not be loaded/)).toBeDefined()
    })
    const field = screen.getByRole('combobox', { name: 'Canton' }).closest('[data-formancy-part="field"]')
    expect(field?.querySelector('[data-formancy-part="error"]')).toBeNull()
  })

  test('names an answer the form already holds, so a resumed draft is not blank', async () => {
    const { sources, asked } = answering()
    await mount({ sources, initialValue: { canton: 'VD' } })

    await waitFor(() => {
      expect(asked.some((request) => request.kind === 'labels')).toBe(true)
    })
    expect(asked.find((request) => request.kind === 'labels')?.values).toEqual(['VD'])
  })
})

describe('a typeahead whose options come from a source', () => {
  test('asks the source what was typed, rather than filtering locally', async () => {
    const { sources, asked } = answering()
    const { settle } = await mount({ widget: 'typeahead', sources })

    fireEvent.input(screen.getByRole('combobox', { name: 'Canton' }), {
      target: { value: 'ber' },
    })
    await settle()

    await waitFor(() => {
      expect(asked.some((request) => request.query === 'ber')).toBe(true)
    })
    await until(settle, () => {
      expect(screen.getAllByRole('option')).toHaveLength(3)
    })
  })

  test('marks itself busy and never disables the box somebody is typing in', async () => {
    const { settle } = await mount({
      widget: 'typeahead',
      sources: { cantons: { debounceMs: 0, resolve: () => new Promise(() => undefined) } },
    })

    const box = screen.getByRole('combobox', { name: 'Canton' })
    fireEvent.input(box, { target: { value: 'z' } })
    await settle()

    await until(settle, () => {
      expect(box.getAttribute('aria-busy')).toBe('true')
    })
    expect(box).toHaveProperty('disabled', false)
  })

  test('says how many rows were left out', async () => {
    const many = Array.from({ length: 12 }, (_, index) => ({
      value: `v${String(index)}`,
      label: `Row ${String(index)}`,
    }))
    const { settle } = await mount({
      widget: 'typeahead',
      sources: { cantons: { debounceMs: 0, maxRows: 5, resolve: () => Promise.resolve(many) } },
    })

    fireEvent.input(screen.getByRole('combobox', { name: 'Canton' }), { target: { value: 'r' } })
    await settle()

    await until(settle, () => {
      expect(screen.getByText(/Showing the first 5 of 12/)).toBeDefined()
    })
  })

  test('asks nothing at all below the length a source set', async () => {
    const { sources, asked } = answering()
    const withMinimum: OptionsSources = { cantons: { ...sources['cantons']!, minQueryLength: 3 } }
    const { settle } = await mount({ widget: 'typeahead', sources: withMinimum })

    fireEvent.input(screen.getByRole('combobox', { name: 'Canton' }), { target: { value: 'be' } })
    await settle()

    await until(settle, () => {
      expect(screen.getByText(/Type at least 3 characters/)).toBeDefined()
    })
    expect(asked.filter((request) => request.kind === 'search')).toHaveLength(0)
  })
})

describe('asking for a name at most once', () => {
  test('does not ask again when the answer does not contain the stored value', async () => {
    // The unbounded loop this prevents, measured in the React binding at 602 requests
    // in 300ms: the guard was "do we already know this name?", which stays false when
    // a source does not know it — and the answer still replaced the map, which changed
    // the signal, which re-ran the effect.
    const labelRequests: string[][] = []
    const { settle } = await mount({
      sources: {
        cantons: {
          debounceMs: 0,
          resolve: (request) => {
            if (request.kind === 'labels') labelRequests.push([...request.values])
            return Promise.resolve([])
          },
        },
      },
      initialValue: { canton: 'XX' },
    })

    await until(settle, () => {
      expect(labelRequests.length).toBeGreaterThan(0)
    })

    await new Promise((resolve) => setTimeout(resolve, 300))
    await settle()
    expect(labelRequests).toEqual([['XX']])
  })
})

describe('a typeahead whose source the deployment does not have', () => {
  test('says so, rather than offering a combobox that can never answer', async () => {
    // The branch order this fixes: the widget was dispatched BEFORE the unavailable
    // check, so the message was unreachable for the very widget the feature was built
    // for. What a person got was a combobox that returned nothing and announced "No
    // options match" -- which says the list has no such row, when there is no list.
    await mount({ widget: 'typeahead' })

    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.getByText(/answers come from "cantons"/)).toBeDefined()
  })

  test('and a typeahead WITH its source still renders the combobox', async () => {
    const { sources } = answering()
    await mount({ widget: 'typeahead', sources })

    expect(screen.getByRole('combobox', { name: 'Canton' })).toBeDefined()
  })
})

describe('a sourced typeahead showing the answer it holds', () => {
  test('shows the stored answer in the box, not an empty string', async () => {
    // The divergence this fixes: Angular looked the stored value up in the DOCUMENT's
    // options, and a field with `optionsSource` has none — the schema forbids both —
    // so `chosen` was permanently undefined and the box rendered empty over an answer
    // the form was holding. React looked it up in the offered list from the start.
    const { sources } = answering()
    const { settle } = await mount({
      widget: 'typeahead',
      sources,
      initialValue: { canton: 'VD' },
    })

    await until(settle, () => {
      expect(screen.getByRole('combobox', { name: 'Canton' })).toHaveProperty('value', 'Vaud')
    })
  })
})

describe('asking once, not twice', () => {
  test('a sourced typeahead sends one search, not one per component', async () => {
    // A select carrying `widget: "typeahead"` delegates to another component, and both
    // extend the same base — so both wired the source up and both asked, and one set
    // of answers was read by nobody. React stands its parent down explicitly; this
    // binding did not, which made the same document cost twice as many requests here.
    const { sources, asked } = answering()
    const { settle } = await mount({ widget: 'typeahead', sources })

    fireEvent.input(screen.getByRole('combobox', { name: 'Canton' }), { target: { value: 'be' } })
    await settle()

    await until(settle, () => {
      expect(asked.filter((request) => request.query === 'be')).toHaveLength(1)
    })
  })
})

describe('what a resolver is told', () => {
  test('sends the field’s DATA PATH, which is what the contract promises', async () => {
    // Both renderers sent `def.key` while documenting "the field's data path, e.g.
    // `canton` or `people[1].canton`". A resolver could not tell two same-named
    // sourced fields apart and never saw which row it answered for.
    const { sources, asked } = answering()
    await mount({ sources })

    await waitFor(() => {
      expect(asked.length).toBeGreaterThan(0)
    })
    expect(asked[0]?.path).toBe('canton')
  })
})

/**
 * A source's answer as a case hands it over, one request at a time.
 *
 * Every request waits until the case answers it, so a state between two answers — a
 * search in flight with the last answer still on screen — is one the DOM really reaches
 * rather than one two settles in a row skip. And it honours its signal, as a host should:
 * an aborted request rejects, which is the rejection a renderer must not report.
 */
function deferred(extra: { maxRows?: number; minQueryLength?: number } = {}) {
  const asked: OptionsRequest[] = []
  const pending: Array<{ answer: (value: unknown) => void; fail: (error: unknown) => void }> = []
  const sources: OptionsSources = {
    cantons: {
      debounceMs: 0,
      ...extra,
      resolve: (request) => {
        asked.push(request)
        return new Promise((answer, fail) => {
          pending.push({ answer: answer as (value: unknown) => void, fail })
          request.signal.addEventListener('abort', () => fail(new DOMException('aborted', 'AbortError')))
        })
      },
    },
  }
  return { sources, asked, pending, searches: () => asked.filter((request) => request.kind === 'search') }
}

/** Each answer by what was asked, so a case reads as the conversation it is. */
const by = (answers: (request: OptionsRequest) => unknown, extra: { maxRows?: number; minQueryLength?: number } = {}) => {
  const asked: OptionsRequest[] = []
  const sources: OptionsSources = {
    cantons: {
      debounceMs: 0,
      ...extra,
      resolve: (request) => {
        asked.push(request)
        return Promise.resolve(answers(request)) as never
      },
    },
  }
  return { sources, asked, searches: () => asked.filter((request) => request.kind === 'search') }
}

/** The English the control says, read off the shipped catalogue rather than retyped. */
const en = createFormText({ locale: '' })

const status = (): string => screen.getByRole('status').textContent?.trim() ?? ''
const box = (): HTMLInputElement => screen.getByRole<HTMLInputElement>('combobox', { name: 'Canton' })
const pause = (ms = 50): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const ZUG = { value: 'ZG', label: 'Zug' }

describe('a typeahead over a source that pages', () => {
  test('says there are more, with how many it shows and no total', async () => {
    // The failure this prevents: a source backed by a database reads `limit + 1` rows to
    // know there are more, and before a page could say so it either looked complete or
    // claimed a total of `limit + 1` that nobody counted.
    const { sources } = by(() => ({ options: CANTONS, more: true }), { maxRows: 2 })
    const { settle } = await mount({ widget: 'typeahead', sources })

    fireEvent.input(box(), { target: { value: 'r' } })
    await settle()

    await until(settle, () => {
      expect(status()).toBe(en('options.more', { count: 2 }))
    })
    expect(screen.getAllByRole('option')).toHaveLength(2)
  })

  test('says what its list leaves out only while the list is open', async () => {
    // The failure this prevents: a typeahead asks on mount, and its sentence stood under
    // the field at rest and after a choice, so a form opened on a saved record said "keep
    // typing to narrow" under every long lookup nobody was using.
    const { sources, asked } = answering()
    const capped: OptionsSources = { cantons: { ...sources['cantons']!, maxRows: 2 } }
    const { settle } = await mount({ widget: 'typeahead', sources: capped })

    await until(settle, () => {
      expect(asked.some((request) => request.kind === 'search')).toBe(true)
      expect(box().getAttribute('aria-busy')).toBeNull()
    })
    expect(status()).toBe('')

    const said = en('options.capped', { shown: 2, total: 3 })
    fireEvent.click(box())
    await until(settle, () => {
      expect(status()).toBe(said)
    })

    fireEvent.click(screen.getByRole('option', { name: 'Zürich' }))
    await until(settle, () => {
      expect(status()).toBe('')
    })

    fireEvent.click(box())
    await until(settle, () => {
      expect(status()).toBe(said)
    })

    fireEvent.keyDown(box(), { key: 'Escape' })
    await until(settle, () => {
      expect(status()).toBe('')
    })
  })

  test('a search that settles on what is already said writes nothing to the region', async () => {
    // The repetition the issue measured: every debounced search went through
    // "Searching…" and back to the same sentence, so a screen reader heard it again after
    // every keystroke. The sentence describes the rows still on screen and is held while
    // the next answer is on its way; `aria-busy` says the search.
    const { sources, pending, searches } = deferred({ maxRows: 2 })
    const { settle } = await mount({ widget: 'typeahead', sources })
    await until(settle, () => {
      expect(searches()).toHaveLength(1)
    })
    pending[0]!.answer(CANTONS)

    fireEvent.input(box(), { target: { value: 'e' } })
    await settle()
    await until(settle, () => {
      expect(searches()).toHaveLength(2)
    })
    pending[1]!.answer(CANTONS)
    const said = en('options.capped', { shown: 2, total: 3 })
    await until(settle, () => {
      expect(status()).toBe(said)
      expect(box().getAttribute('aria-busy')).toBeNull()
    })

    const region = screen.getByRole('status')
    let written = 0
    const observer = new MutationObserver((records) => {
      written += records.length
    })
    observer.observe(region, { childList: true, characterData: true, subtree: true })

    fireEvent.input(box(), { target: { value: 'er' } })
    await settle()
    await until(settle, () => {
      expect(searches()).toHaveLength(3)
      expect(box().getAttribute('aria-busy')).toBe('true')
    })
    pending[2]!.answer(CANTONS)
    await until(settle, () => {
      expect(box().getAttribute('aria-busy')).toBeNull()
    })
    written += observer.takeRecords().length
    observer.disconnect()

    expect(written).toBe(0)
    expect(status()).toBe(said)
  })

  test('says what was withheld when nothing else is left out, and that there are more over it', async () => {
    // The failure this prevents: a row a source matched and cannot hand over — a value a
    // select could not store — filtered out in silence, so the person cannot tell it from a
    // row the source does not have. While more rows match, the withheld count covers one
    // page and is a lower bound, which nobody should be told as a number.
    const { sources } = by((request) =>
      request.query === 'zu' ? { options: [ZUG], more: false, withheld: 1 } : { options: CANTONS.slice(0, 2), more: true, withheld: 3 },
    )
    const { settle } = await mount({ widget: 'typeahead', sources })

    fireEvent.input(box(), { target: { value: 'zu' } })
    await settle()
    await until(settle, () => {
      expect(status()).toBe(en('options.withheld', { count: 1 }))
    })

    fireEvent.input(box(), { target: { value: 'z' } })
    await settle()
    await until(settle, () => {
      expect(status()).toBe(en('options.more', { count: 2 }))
    })
  })

  test('a page with a key it does not know is a failure, not a list', async () => {
    // The failure this prevents: a misspelt `moer: true`, or a `total` read as nothing,
    // would show a cut list as complete. The same page without the key is a list, so the
    // refusal is the key's and not every page's.
    const { sources } = by((request) => (request.query === 'zu' ? { options: [ZUG], more: false, total: 40 } : { options: [ZUG], more: false }))
    const { settle } = await mount({ widget: 'typeahead', sources })

    fireEvent.input(box(), { target: { value: 'zu' } })
    await settle()
    await until(settle, () => {
      expect(status()).toBe(en('options.failed'))
    })
    expect(screen.queryAllByRole('option')).toHaveLength(0)

    fireEvent.input(box(), { target: { value: 'zug' } })
    await settle()
    await until(settle, () => {
      expect(screen.getByRole('option', { name: 'Zug' })).toBeDefined()
    })
    expect(status()).toBe('')
  })

  /**
   * A cut list said, then an answer that is lost, then the search after it, in flight.
   *
   * A lost answer empties the list, and a sentence about what the list before it left
   * out, held through the next search, would describe rows that are no longer there. On
   * main this held because "Searching…" won whenever a request was in flight; with held
   * sentences, the reset when an answer is lost is the thing that keeps it true.
   */
  async function searchingAfter(lose: (answer: { answer: (value: unknown) => void; fail: (error: unknown) => void }) => void) {
    const { sources, pending, searches } = deferred({ maxRows: 2 })
    const { settle } = await mount({ widget: 'typeahead', sources })
    await until(settle, () => {
      expect(searches()).toHaveLength(1)
    })
    pending[0]!.answer(CANTONS)

    fireEvent.input(box(), { target: { value: 'e' } })
    await settle()
    await until(settle, () => {
      expect(searches()).toHaveLength(2)
    })
    pending[1]!.answer(CANTONS)
    await until(settle, () => {
      expect(status()).toBe(en('options.capped', { shown: 2, total: 3 }))
    })

    fireEvent.input(box(), { target: { value: 'er' } })
    await settle()
    await until(settle, () => {
      expect(searches()).toHaveLength(3)
    })
    lose(pending[2]!)
    await until(settle, () => {
      expect(status()).toBe(en('options.failed'))
    })

    fireEvent.input(box(), { target: { value: 'ern' } })
    await settle()
    await until(settle, () => {
      expect(searches()).toHaveLength(4)
      expect(status()).toBe(en('options.searching'))
    })
  }

  test('a search after a failure says it is searching, not what the failed list left out', async () => {
    // The failure this prevents: a source that rejected leaving the sentence about the
    // list before it standing over the empty one, through the search after it.
    await searchingAfter((pending) => pending.fail(new Error('down')))
  })

  test('a search after an answer refused whole says it is searching, not what the refused list left out', async () => {
    // The same, for an answer that arrived and was refused, which is the other way an
    // answer is lost: it must reset what was said as a rejection does.
    await searchingAfter((pending) => pending.answer({ options: CANTONS, more: false, total: 3 }))
  })

  test('a search after dropping under the minimum says it is searching, not what the emptied list left out', async () => {
    // The same failure from the other side: under the minimum the list is emptied, and the
    // sentence about the list before it must go with it, or it returns over nothing.
    const { sources, pending, searches } = deferred({ maxRows: 2, minQueryLength: 2 })
    const { settle } = await mount({ widget: 'typeahead', sources })

    fireEvent.input(box(), { target: { value: 'be' } })
    await settle()
    await until(settle, () => {
      expect(searches()).toHaveLength(1)
    })
    pending[0]!.answer(CANTONS)
    await until(settle, () => {
      expect(status()).toBe(en('options.capped', { shown: 2, total: 3 }))
    })

    fireEvent.input(box(), { target: { value: 'b' } })
    await settle()
    await until(settle, () => {
      expect(status()).toBe(en('options.tooShort', { count: 2 }))
    })

    fireEvent.input(box(), { target: { value: 'be' } })
    await settle()
    await until(settle, () => {
      expect(searches()).toHaveLength(2)
      expect(status()).toBe(en('options.searching'))
    })
  })
})

describe('a plain select over a source, which nobody can type into', () => {
  test('asks nothing more when an answer is chosen or the field is left', async () => {
    // The failure this prevents, measured here before this change at three searches where
    // one was asked for: the search re-ran whenever the field's snapshot changed, because
    // it read a definition rebuilt on every snapshot, so choosing an answer and leaving the
    // field each asked the source for the same unchanged list again.
    const { sources, asked } = answering()
    const { settle } = await mount({ sources })
    await until(settle, () => {
      expect(screen.getAllByRole('option')).toHaveLength(4)
    })

    const select = screen.getByRole('combobox', { name: 'Canton' })
    fireEvent.change(select, { target: { value: 'BE' } })
    await settle()
    select.focus()
    select.blur()
    await settle()
    await pause()
    await settle()

    expect(asked.filter((request) => request.kind === 'search')).toHaveLength(1)
  })

  test('says how many it shows in words of its own, and never asks anybody to keep typing', async () => {
    // The failure this prevents: a `<select>` past its cap said "keep typing to narrow",
    // which nobody can do in a list, and a page that goes on borrowed the same sentence.
    const { sources } = answering()
    const { settle } = await mount({ sources: { cantons: { ...sources['cantons']!, maxRows: 2 } } })

    await until(settle, () => {
      expect(status()).toBe(en('options.cappedListed', { count: 2, total: 3 }))
    })
    expect(status()).not.toBe(en('options.capped', { shown: 2, total: 3 }))
    TestBed.resetTestingModule()
    document.body.innerHTML = ''

    const paged = by(() => ({ options: CANTONS, more: true }), { maxRows: 2 })
    const again = await mount({ sources: paged.sources })
    await until(again.settle, () => {
      expect(status()).toBe(en('options.moreListed', { count: 2 }))
    })
    expect(status()).not.toBe(en('options.more', { count: 2 }))
  })

  test('over a source that answers only a search, says so and asks nothing', async () => {
    // The failure this prevents: "type at least 2 characters" under a list nobody can
    // type into, over a source that will never be asked.
    const { sources, searches } = by(() => CANTONS, { minQueryLength: 2 })
    const { settle } = await mount({ sources })

    await until(settle, () => {
      expect(status()).toBe(en('options.searchOnly'))
    })
    await pause()
    await settle()
    expect(searches()).toHaveLength(0)
  })

  test('whose source failed says so in its own words, and asks again when the person moves to it', async () => {
    // The failure this prevents: a select whose search failed said "Type to try again",
    // and its query is a constant empty string, so nothing could ever ask again.
    let calls = 0
    const { sources, searches } = by(() => {
      calls += 1
      return calls === 1 ? Promise.reject(new Error('down')) : CANTONS
    })
    const { settle } = await mount({ sources })
    await until(settle, () => {
      expect(status()).toBe(en('options.failedListed'))
    })
    expect(searches()).toHaveLength(1)

    const select = screen.getByRole('combobox', { name: 'Canton' })
    select.focus()
    await settle()
    await until(settle, () => {
      expect(screen.getByRole('option', { name: 'Bern' })).toBeDefined()
      expect(status()).toBe('')
    })
    expect(searches()).toHaveLength(2)

    // Moving to it again when nothing failed asks nothing: the retry is a failure's, not
    // a focus's, or every visit to a list would be a request.
    select.blur()
    await settle()
    select.focus()
    await settle()
    await pause()
    await settle()
    expect(searches()).toHaveLength(2)
  })
})

describe('a sourced control a rule disables', () => {
  const DISABLED = [{ target: 'canton', kind: 'disabled', cel: 'true' }]

  test.each([
    ['a select', undefined],
    ['a typeahead', 'typeahead' as const],
  ])('%s asks only for the name of what it holds, and says nothing', async (_, widget) => {
    // The failure this prevents: a read-only record searched every lookup on it and said
    // "keep typing to narrow" under fields nobody can change. It still names what it holds,
    // or a saved answer would show as a bare value.
    const { sources, asked } = answering()
    const { settle } = await mount({
      ...(widget === undefined ? {} : { widget }),
      sources,
      rules: DISABLED,
      initialValue: { canton: 'VD' },
    })

    await until(settle, () => {
      expect(asked.filter((request) => request.kind === 'labels')).toHaveLength(1)
      if (widget === 'typeahead') expect(box().value).toBe('Vaud')
      else expect(screen.getByRole('option', { name: 'Vaud' })).toHaveProperty('selected', true)
    })
    await pause()
    await settle()
    expect(asked.filter((request) => request.kind === 'search')).toHaveLength(0)
    expect(asked.find((request) => request.kind === 'labels')?.values).toEqual(['VD'])
    expect(status()).toBe('')
    expect(box().getAttribute('aria-busy')).toBeNull()
  })

  test.each([
    ['a select', undefined],
    ['a typeahead', 'typeahead' as const],
  ])('%s over a source that answers only a search says nothing about searching', async (_, widget) => {
    // The failure this prevents: below the minimum is said before anything else a
    // source's state comes to, so a read-only lookup still told its person to type, or
    // that its list cannot search, though nobody can do either in a disabled field.
    const { sources } = by(() => CANTONS, { minQueryLength: 2 })
    const { settle } = await mount({
      ...(widget === undefined ? {} : { widget }),
      sources,
      rules: DISABLED,
      initialValue: { canton: 'VD' },
    })

    await until(settle, () => {
      if (widget === 'typeahead') expect(box().value).toBe('Vaud')
      else expect(screen.getByRole('option', { name: 'Vaud' })).toHaveProperty('selected', true)
    })
    await pause()
    await settle()
    expect(status()).toBe('')
  })

  test('a control disabled while its search is in flight reports no failure and is not busy', async () => {
    // The failure this prevents: disabling aborts the search, and an abort arriving at a
    // handler that still believes it is current reports the source as down, under a field
    // nobody can change, or leaves the box marked busy with nothing in flight. Typed into
    // first, as React's case is, so the list is open when the rule lands: a list still
    // open under a disabled field said "No options match" over its empty rows.
    const { sources, searches } = deferred()
    const { engine, settle } = await mount({
      widget: 'typeahead',
      sources,
      before: [{ key: 'locked', type: 'checkbox', label: 'Locked' }],
      rules: [{ target: 'canton', kind: 'disabled', cel: 'locked == true' }],
      initialValue: { locked: false },
    })
    fireEvent.input(box(), { target: { value: 'z' } })
    await until(settle, () => {
      expect(searches().at(-1)?.query).toBe('z')
      expect(box().getAttribute('aria-busy')).toBe('true')
    })

    engine.setValue(['locked'], true)
    await settle()
    await until(settle, () => {
      expect(box()).toHaveProperty('disabled', true)
      expect(box().getAttribute('aria-busy')).toBeNull()
    })
    await pause()
    await settle()
    // The host is told nobody wants the answer, and the abort is not read as the source
    // failing: the sentence is empty either way under a disabled field, so the failure
    // would show only in the state every theme styles a failure by.
    expect(searches().at(-1)!.signal.aborted).toBe(true)
    expect(screen.getByRole('status').getAttribute('data-state')).toBeNull()
    expect(status()).toBe('')
    expect(searches().map((request) => request.query)).toEqual(['z'])
  })

  test('a typeahead disabled while its list is open draws no list and says nothing', async () => {
    // The failure this prevents: a rule disabling the field while its list showed left the
    // list on screen and `aria-expanded` true, with rows a click would still store into a
    // field nobody may change. A box disabled under the person is not reliably blurred —
    // jsdom fires no blur — so only the rule can hide what it made read-only.
    const { sources } = by(() => CANTONS)
    const { engine, settle } = await mount({
      widget: 'typeahead',
      sources,
      before: [{ key: 'locked', type: 'checkbox', label: 'Locked' }],
      rules: [{ target: 'canton', kind: 'disabled', cel: 'locked == true' }],
      initialValue: { locked: false },
    })
    fireEvent.click(box())
    await until(settle, () => {
      expect(screen.getByRole('option', { name: 'Zürich' })).toBeDefined()
    })
    expect(box().getAttribute('aria-expanded')).toBe('true')

    engine.setValue(['locked'], true)
    await until(settle, () => {
      expect(box()).toHaveProperty('disabled', true)
    })
    expect(box().getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(screen.queryByRole('option')).toBeNull()
    expect(status()).toBe('')
    expect(screen.getByRole('status').getAttribute('data-state')).toBeNull()

    // Hidden, not closed: enabled again before anything closed it, the list the person had
    // open shows again, as React's does. 0177 states this as a cost.
    engine.setValue(['locked'], false)
    await until(settle, () => {
      expect(box().getAttribute('aria-expanded')).toBe('true')
      expect(screen.getByRole('option', { name: 'Zürich' })).toBeDefined()
    })
  })

  test('a control disabled after its search failed shows no failure', async () => {
    // The failure this prevents: a source that was down when the record opened stays
    // drawn as a failure under a field a rule has since made read-only, where nobody can
    // do anything about it.
    const { sources } = by(() => Promise.reject(new Error('down')))
    const { engine, settle } = await mount({
      widget: 'typeahead',
      sources,
      before: [{ key: 'locked', type: 'checkbox', label: 'Locked' }],
      rules: [{ target: 'canton', kind: 'disabled', cel: 'locked == true' }],
      initialValue: { locked: false },
    })
    await until(settle, () => {
      expect(status()).toBe(en('options.failed'))
    })
    expect(screen.getByRole('status').getAttribute('data-state')).toBe('failed')

    engine.setValue(['locked'], true)
    await settle()
    await until(settle, () => {
      expect(box()).toHaveProperty('disabled', true)
      expect(status()).toBe('')
      expect(screen.getByRole('status').getAttribute('data-state')).toBeNull()
    })
  })

  test('names what it holds from a page as it does from a list', async () => {
    // The failure this prevents: a source that answers every request as a page — the
    // natural shape for one that pages — had its `labels` answer refused, so a disabled
    // field, which asks for nothing else, showed a bare stored value.
    const { sources, asked } = by((request) => ({
      options: CANTONS.filter((row) => request.values.includes(row.value)),
      more: false,
    }))
    const { settle } = await mount({
      widget: 'typeahead',
      sources,
      rules: DISABLED,
      initialValue: { canton: 'VD' },
    })

    await until(settle, () => {
      expect(box().value).toBe('Vaud')
    })
    expect(asked.map((request) => request.kind)).toEqual(['labels'])
  })

  test.each([
    ['refused', () => ({ options: [{ value: 'VD', label: 'Vaud' }], more: false, total: 1 })],
    ['not given', () => Promise.reject(new Error('down'))],
  ])('shows the stored value itself when its name is %s', async (_, answer) => {
    // The failure this prevents: a name that cannot be had blanking the answer the form
    // holds, or being read as the source failing under a field nobody can change. A
    // labels answer goes through the same gate as a search, so a page with a key nobody
    // knows names nothing here either. This held before this change too; it is here
    // because the gate it goes through is new.
    const { sources } = by(answer)
    const { settle } = await mount({
      widget: 'typeahead',
      sources,
      rules: DISABLED,
      initialValue: { canton: 'VD' },
    })

    await until(settle, () => {
      expect(box().value).toBe('VD')
    })
    await pause()
    await settle()
    expect(box().value).toBe('VD')
    expect(status()).toBe('')
  })
})

describe('an auditor over what a sourced control says', () => {
  const violationsNow = async (): Promise<string[]> => {
    const off = { ...ACCESSIBILITY_EXCLUSIONS, ...ACCESSIBILITY_UNMEASURABLE_IN_JSDOM }
    const results = await axe.run(document.body, {
      runOnly: { type: 'tag', values: [...ACCESSIBILITY_TAGS] },
      rules: Object.fromEntries(Object.keys(off).map((id) => [id, { enabled: false }])),
      resultTypes: ['violations'],
    })
    return results.violations.map((violation) => `${violation.id}: ${violation.nodes[0]?.html ?? ''}`)
  }

  test('finds nothing under an open page that goes on, a failed select or a disabled lookup', async () => {
    // The states this change adds, which no conformance fixture reaches: its driver cannot
    // supply a source. Run here as the typeahead's own suite runs it on its three states.
    const paged = by(() => ({ options: CANTONS, more: true }), { maxRows: 2 })
    const typeahead = await mount({ widget: 'typeahead', sources: paged.sources })
    fireEvent.input(box(), { target: { value: 'r' } })
    await typeahead.settle()
    await until(typeahead.settle, () => {
      expect(status()).toBe(en('options.more', { count: 2 }))
    })
    expect(await violationsNow()).toEqual([])
    TestBed.resetTestingModule()
    document.body.innerHTML = ''

    const down = by(() => Promise.reject(new Error('down')))
    const select = await mount({ sources: down.sources })
    await until(select.settle, () => {
      expect(status()).toBe(en('options.failedListed'))
    })
    expect(await violationsNow()).toEqual([])
    TestBed.resetTestingModule()
    document.body.innerHTML = ''

    const { sources } = answering()
    const disabled = await mount({
      widget: 'typeahead',
      sources,
      rules: [{ target: 'canton', kind: 'disabled', cel: 'true' }],
      initialValue: { canton: 'VD' },
    })
    await until(disabled.settle, () => {
      expect(box().value).toBe('Vaud')
    })
    expect(await violationsNow()).toEqual([])
  }, 20_000)
})
