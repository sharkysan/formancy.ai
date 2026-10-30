import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import axe from 'axe-core'

import { ACCESSIBILITY_EXCLUSIONS, ACCESSIBILITY_TAGS, ACCESSIBILITY_UNMEASURABLE_IN_JSDOM } from '@formancy/conformance'
import { createFormEngine } from '@formancy/core'
import type { FormEngine } from '@formancy/core'
import { createFormText } from '@formancy/core/words'
import type { FormSchema } from '@formancy/spec'

import { FormancyForm, FormancyProvider, OptionsSourcesProvider } from './index.js'
import type { OptionsRequest, OptionsSource, OptionsSources } from './index.js'

afterEach(cleanup)

const CLOCK = { now: () => 0, today: () => '2026-09-27', random: () => 0.5 }

/**
 * Longer than testing-library's default second.
 *
 * This control is asynchronous by design — a debounce, a round trip and a React flush —
 * and on a loaded CI runner a second is tight. A timeout there reads as a broken control
 * when the machine was simply busy, which is the most expensive kind of flake: it makes
 * a real failure indistinguishable from noise.
 */
const WAITING = { timeout: 5_000 }

/**
 * `optionsSource` — a select whose answers come from the deployment.
 *
 * The document names a list; the deployment says what that name means; nothing in
 * formancy ever makes a request of its own. A URL in a form document would be a
 * deployment detail in a portable format — unfixable once a version is published,
 * pointing at the wrong system the moment a form is copied between environments,
 * and an SSRF surface on an instance that sits inside a private network.
 *
 * The third instance of the inversion the uploader and the scanner already are, with
 * one deliberate difference: a MAP rather than one resolver, because the control has
 * to know *synchronously* whether a name resolves. Absence here is the file field's
 * branch and not the scanner's — a text field with no scanner still collects by
 * typing, and a select whose options come only from a source collects nothing.
 */
function schema(widget?: 'typeahead', { before = [], logic }: { before?: unknown[]; logic?: unknown } = {}): FormSchema {
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
    ...(logic === undefined ? {} : { logic }),
  } as unknown as FormSchema
}

function mount({
  widget,
  sources,
  initialValue,
  before,
  logic,
}: {
  widget?: 'typeahead'
  sources?: OptionsSources
  initialValue?: Record<string, unknown>
  /** Fields ahead of the sourced one, such as a checkbox a rule reads. */
  before?: unknown[]
  logic?: unknown
} = {}): FormEngine {
  const engine = createFormEngine({
    schema: schema(widget, {
      ...(before === undefined ? {} : { before }),
      ...(logic === undefined ? {} : { logic }),
    }),
    capabilities: CLOCK,
    ...(initialValue === undefined ? {} : { initialValue }),
  })
  render(
    <FormancyProvider engine={engine}>
      {sources === undefined ? (
        <FormancyForm onSubmit={() => undefined} />
      ) : (
        <OptionsSourcesProvider value={sources}>
          <FormancyForm onSubmit={() => undefined} />
        </OptionsSourcesProvider>
      )}
    </FormancyProvider>,
  )
  return engine
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

describe('a select whose options come from a source', () => {
  test('says so instead of rendering an empty chooser when the deployment has none', () => {
    // The whole field, not a missing affordance. A select with no options collects
    // nothing, so this is the file field's message and not the scanner's silence.
    mount()

    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.getByText(/answers come from "cantons"/)).toBeDefined()
  })

  test('offers what the source returned', async () => {
    const { sources } = answering()
    mount({ sources })

    await waitFor(() => {
      expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['', 'Zürich', 'Bern', 'Vaud'])
    }, WAITING)
  })

  test('asks in the locale the engine resolves text in, not the document default', async () => {
    // The request carries the locale because a remote label is a plain string: a
    // `{$t}` reference arriving at runtime is checked by nothing, resolves to
    // undefined and shows an opaque identifier. So the source answers in the right
    // language instead.
    const { sources, asked } = answering()
    const engine = createFormEngine({ schema: schema(), capabilities: CLOCK, locale: 'fr' })
    render(
      <FormancyProvider engine={engine}>
        <OptionsSourcesProvider value={sources}>
          <FormancyForm onSubmit={() => undefined} />
        </OptionsSourcesProvider>
      </FormancyProvider>,
    )

    await waitFor(() => {
      expect(asked[0]?.locale).toBe('fr')
    }, WAITING)
    expect(asked[0]?.source).toBe('cantons')
  })

  test('stores the option value, exactly as a listed option would', async () => {
    const { sources } = answering()
    const engine = mount({ sources })

    await waitFor(() => {
      expect(screen.getAllByRole('option')).toHaveLength(4)
    }, WAITING)
    fireEvent.change(screen.getByRole('combobox', { name: 'Canton' }), { target: { value: 'BE' } })

    expect(engine.value()).toEqual({ canton: 'BE' })
  })

  test('refuses the whole list when one row is unusable, rather than showing part of it', async () => {
    // A partial list silently lacks the row somebody came for, and they cannot tell
    // that from a source that does not have it.
    const { sources } = answering([{ value: 'ZH', label: 'Zürich' }, { value: 'BE' }] as never)
    mount({ sources })

    await waitFor(() => {
      expect(screen.getByText(/could not be loaded/)).toBeDefined()
    }, WAITING)
    // Only the empty option: nothing from a list that could not be trusted.
    expect(screen.getAllByRole('option')).toHaveLength(1)
  })

  test('a source that rejects is reported in the status region, never as an error', async () => {
    // A source being down is not a wrong answer. The error region is the control's
    // describedby target and carries the engine's verdict — the same line the scanner
    // draws for a refused camera.
    mount({
      sources: {
        cantons: { debounceMs: 0, resolve: () => Promise.reject(new Error('down')) },
      },
    })

    await waitFor(() => {
      expect(screen.getByText(/The options could not be loaded/)).toBeDefined()
    }, WAITING)
    const field = screen.getByRole('combobox', { name: 'Canton' }).closest('[data-formancy-part="field"]')
    expect(field?.querySelector('[data-formancy-part="error"]')).toBeNull()
  })

  test('names an answer the form already holds, so a resumed draft is not blank', async () => {
    // With no document options there is no list on mount, so a resumed draft, a wizard
    // page change or a datagrid row move — which remounts every control in the row by
    // design — would render an empty box over a stored answer.
    const { sources, asked } = answering()
    mount({ sources, initialValue: { canton: 'VD' } })

    await waitFor(() => {
      expect(asked.some((request) => request.kind === 'labels')).toBe(true)
    }, WAITING)
    expect(asked.find((request) => request.kind === 'labels')?.values).toEqual(['VD'])
  })

  test('still offers the stored answer while a source has not answered', () => {
    // Before anything arrives the control shows the raw value rather than nothing —
    // the same fallback an authored option with a missing label already gets.
    mount({
      sources: { cantons: { debounceMs: 10_000, resolve: () => new Promise(() => undefined) } },
      initialValue: { canton: 'VD' },
    })

    expect(screen.getAllByRole('option').map((option) => option.textContent)).toContain('VD')
  })
})

describe('a typeahead whose options come from a source', () => {
  test('asks the source what was typed, rather than filtering locally', async () => {
    // A source is the authority on what matches: it was handed the query, and
    // re-folding its rows would drop ones it matched on data the person cannot see.
    const { sources, asked } = answering()
    mount({ widget: 'typeahead', sources })

    fireEvent.change(screen.getByRole('combobox', { name: 'Canton' }), {
      target: { value: 'ber' },
    })

    await waitFor(() => {
      expect(asked.some((request) => request.query === 'ber')).toBe(true)
    }, WAITING)
    // Everything the source returned is shown, including rows a local fold would
    // have dropped.
    await waitFor(() => {
      expect(screen.getAllByRole('option')).toHaveLength(3)
    }, WAITING)
  })

  test('marks itself busy and never disables the box somebody is typing in', async () => {
    // Disabling the element somebody just typed into blurs it, and the browser then
    // resets focus to the document body — the reason the scanner's button stays
    // enabled while a scan is in flight too.
    mount({
      widget: 'typeahead',
      sources: { cantons: { debounceMs: 0, resolve: () => new Promise(() => undefined) } },
    })

    const box = screen.getByRole('combobox', { name: 'Canton' })
    fireEvent.change(box, { target: { value: 'z' } })

    await waitFor(() => {
      expect(box.getAttribute('aria-busy')).toBe('true')
    }, WAITING)
    expect(box).toHaveProperty('disabled', false)
  })

  test('says how many rows were left out, so a cut list is not mistaken for the whole one', async () => {
    const many = Array.from({ length: 12 }, (_, index) => ({
      value: `v${String(index)}`,
      label: `Row ${String(index)}`,
    }))
    mount({
      widget: 'typeahead',
      sources: { cantons: { debounceMs: 0, maxRows: 5, resolve: () => Promise.resolve(many) } },
    })

    fireEvent.change(screen.getByRole('combobox', { name: 'Canton' }), { target: { value: 'r' } })

    await waitFor(() => {
      expect(screen.getByText(/Showing the first 5 of 12/)).toBeDefined()
    }, WAITING)
  })

  test('asks nothing at all below the length a source set', async () => {
    const { sources, asked } = answering()
    const withMinimum: OptionsSources = {
      cantons: { ...sources['cantons']!, minQueryLength: 3 },
    }
    mount({ widget: 'typeahead', sources: withMinimum })

    fireEvent.change(screen.getByRole('combobox', { name: 'Canton' }), { target: { value: 'be' } })

    await waitFor(() => {
      expect(screen.getByText(/Type at least 3 characters/)).toBeDefined()
    }, WAITING)
    expect(asked.filter((request) => request.kind === 'search')).toHaveLength(0)
  })

  test('supersedes a request rather than letting an old answer land', async () => {
    // Aborted rather than ignored: a request nobody wants any more is one a host
    // should be able to cancel, and the signal is the only way to tell it so.
    const aborted: boolean[] = []
    const started: string[] = []
    mount({
      widget: 'typeahead',
      sources: {
        cantons: {
          debounceMs: 0,
          resolve: (request) =>
            new Promise((resolve) => {
              started.push(request.query)
              request.signal.addEventListener('abort', () => aborted.push(true))
              // Never settles on its own: the only way out is the abort.
              void resolve
            }),
        },
      },
    })

    const box = screen.getByRole('combobox', { name: 'Canton' })
    fireEvent.change(box, { target: { value: 'z' } })
    // Wait for the first request to actually be SENT. Typing twice quickly is the
    // debounce's job and leaves nothing to abort — which is correct, and not what
    // this case is about.
    await waitFor(() => {
      expect(started).toEqual(['z'])
    }, WAITING)

    fireEvent.change(box, { target: { value: 'zu' } })
    await waitFor(() => {
      expect(aborted.length).toBeGreaterThan(0)
    }, WAITING)
  })
})

describe('asking for a name at most once', () => {
  test('does not ask again when the answer does not contain the stored value', async () => {
    // The loop this prevents, and it is unbounded. A resumed form holds a value the
    // source no longer offers — or a host implements only `kind: 'search'` and answers
    // `[]` to a labels request. The guard is "do we already know this name?", which
    // stays false; the answer still replaced the map with a new one; a new map is a new
    // dependency identity; the effect re-runs and asks again.
    //
    // Each turn waits for a round trip, so React never reports "maximum update depth"
    // — the control just streams requests at the source's answer rate for as long as
    // the form is open. Nothing in the earlier tests could see it: they all used a
    // source that DID know the value.
    const labelRequests: string[][] = []
    mount({
      sources: {
        cantons: {
          debounceMs: 0,
          resolve: (request) => {
            if (request.kind === 'labels') labelRequests.push([...request.values])
            // Knows nothing about this value, which is a legitimate answer.
            return Promise.resolve([])
          },
        },
      },
      initialValue: { canton: 'XX' },
    })

    await waitFor(() => {
      expect(labelRequests.length).toBeGreaterThan(0)
    }, WAITING)

    // Long enough for several more round trips, if it were going to make them.
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(labelRequests).toEqual([['XX']])
  })

  test('asks once more when the stored value changes, which is a different question', async () => {
    const labelRequests: string[][] = []
    const engine = mount({
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

    await waitFor(() => {
      expect(labelRequests).toEqual([['XX']])
    }, WAITING)

    act(() => {
      engine.setValue(['canton'], 'YY')
    })

    await waitFor(() => {
      expect(labelRequests).toEqual([['XX'], ['YY']])
    }, WAITING)
  })
})

describe('a typeahead whose source the deployment does not have', () => {
  test('says so, rather than offering a combobox that can never answer', () => {
    // The branch order this fixes, found by review: the widget was dispatched BEFORE
    // the unavailable check, so the message was unreachable for the very widget the
    // feature was built for. What a person got instead was a working-looking combobox
    // that returned nothing and announced "No options match" — which says the list has
    // no such row, when the truth is there is no list.
    mount({ widget: 'typeahead' })

    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.getByText(/answers come from "cantons"/)).toBeDefined()
  })

  test('and a typeahead WITH its source still renders the combobox', () => {
    // The guard on the guard: a check that fired unconditionally would take the
    // control away from every sourced typeahead in the world.
    const { sources } = answering()
    mount({ widget: 'typeahead', sources })

    expect(screen.getByRole('combobox', { name: 'Canton' })).toBeDefined()
  })
})

describe('what a resolver is told', () => {
  test('sends the field’s DATA PATH, which is what the contract promises', async () => {
    // `OptionsRequest.path` is documented in both renderers as "the field's data path,
    // e.g. `canton` or `people[1].canton`", and both sent `def.key`. A resolver could
    // not tell two same-named sourced fields apart, and never saw which row of a
    // repeater it was answering for — so a host metering or logging per field was
    // metering the wrong thing.
    const { sources, asked } = answering()
    mount({ sources })

    await waitFor(() => {
      expect(asked.length).toBeGreaterThan(0)
    }, WAITING)
    expect(asked[0]?.path).toBe('canton')
  })

  test('backspacing under the minimum does not report the source as broken', async () => {
    // The state machine bug this fixes: the generation was bumped only on the path
    // that SENDS a request, so deleting characters back under the minimum aborted
    // whatever was in flight while leaving the generation unchanged — and the abort
    // arrived at a handler that still believed it was current. Backspacing announced
    // "The options could not be loaded" for a source that was working perfectly, and
    // left the box marked busy with nothing in flight.
    const { sources } = answering()
    const withMinimum: OptionsSources = { cantons: { ...sources['cantons']!, minQueryLength: 3 } }
    mount({ widget: 'typeahead', sources: withMinimum })

    const box = screen.getByRole('combobox', { name: 'Canton' })
    fireEvent.change(box, { target: { value: 'ber' } })
    await waitFor(() => {
      expect(screen.queryByText(/Type at least 3/)).toBeNull()
    }, WAITING)

    fireEvent.change(box, { target: { value: 'be' } })

    await waitFor(() => {
      expect(screen.getByText(/Type at least 3 characters/)).toBeDefined()
    }, WAITING)
    expect(screen.queryByText(/could not be loaded/)).toBeNull()
    expect(box.getAttribute('aria-busy')).toBeNull()
  })
})

/**
 * What a sourced control says about the rows it does not show, and when
 * ([0177](../../../docs/decisions/0177-a-source-may-say-its-list-goes-on.md)).
 *
 * A source backed by a database pages: it reads `limit + 1` rows to know there are more,
 * and does not count them. Handed only rows, it either looked complete or claimed a total
 * of `limit + 1`. The sentence itself is decided once, by `optionsStatus` in
 * `@formancy/core/words`; these cases hold this renderer to feeding it what it decides
 * from, at the moments a person can act on it.
 *
 * A near-copy of the Angular file's cases, by the same names, because the conformance
 * driver cannot supply a source. The expected words are the shipped English, read through
 * the catalogue: these cases hold which sentence is said and when, and `words.test.tsx`
 * holds the German.
 */
const say = createFormText({ locale: '' })

/** More rows than any cap these cases set. */
const MANY = Array.from({ length: 12 }, (_, index) => ({
  value: `v${String(index)}`,
  label: `Row ${String(index)}`,
}))

/** The live region a sourced control speaks through: one per form in these cases. */
const region = (): HTMLElement => screen.getByRole('status')

const settle = async (ms = 0): Promise<void> => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms))
  })
}

const DISABLED = [{ target: 'canton', kind: 'disabled', cel: 'true' }]

/** A checkbox ahead of the sourced field, and the rule that disables it when ticked. */
const LOCKABLE = {
  before: [{ key: 'locked', type: 'checkbox', label: 'Locked' }],
  logic: { rules: [{ target: 'canton', kind: 'disabled', cel: 'locked == true' }] },
  initialValue: { locked: false },
}

/**
 * A source the way a database answers: `limit + 1` rows read, one page handed over, and
 * whether there were more said without counting them.
 */
const paging = (rows = MANY): { sources: OptionsSources; asked: OptionsRequest[] } => {
  const asked: OptionsRequest[] = []
  return {
    asked,
    sources: {
      cantons: {
        debounceMs: 0,
        maxRows: 5,
        resolve: (request) => {
          asked.push(request)
          if (request.kind === 'labels') {
            return Promise.resolve(rows.filter((row) => request.values.includes(row.value)))
          }
          const read = rows.slice(0, request.limit + 1)
          return Promise.resolve({ options: read.slice(0, request.limit), more: read.length > request.limit })
        },
      },
    },
  }
}

/** A source whose every answer comes from `answer`, whatever its shape. */
const by = (answer: (request: OptionsRequest) => unknown, extra: Partial<OptionsSource> = {}): { sources: OptionsSources; asked: OptionsRequest[] } => {
  const asked: OptionsRequest[] = []
  return {
    asked,
    sources: {
      cantons: {
        debounceMs: 0,
        ...extra,
        resolve: (request) => {
          asked.push(request)
          return Promise.resolve(answer(request) as never)
        },
      },
    },
  }
}

/** `answering`, cut by the control at five of the twelve rows it hands over. */
const cappedAtFive = (): { sources: OptionsSources; asked: OptionsRequest[] } => {
  const { sources, asked } = answering(MANY)
  return { asked, sources: { cantons: { ...sources['cantons']!, maxRows: 5 } } }
}

describe('a typeahead over a source that pages', () => {
  test('says there are more, with how many it shows and no total', async () => {
    // The defect: a page could not say "more", so a paging source either looked complete
    // or returned one row extra and was announced as "the first 5 of 6" — a total nobody
    // counted. Read as a page, it says what it knows and no number it does not.
    const { sources, asked } = paging()
    mount({ widget: 'typeahead', sources })

    fireEvent.change(screen.getByRole('combobox', { name: 'Canton' }), { target: { value: 'r' } })

    await waitFor(() => {
      expect(region().textContent).toBe(say('options.more', { count: 5 }))
    }, WAITING)
    expect(region().textContent).not.toMatch(/\bof\b|6|12/)
    expect(screen.getAllByRole('option')).toHaveLength(5)
    // Asked at the size the control shows, which is what the source pages by.
    expect(asked.find((request) => request.query === 'r')?.limit).toBe(5)
  })

  test('says what its list leaves out only while the list is open', async () => {
    // A status under the field at rest: the cut list's sentence stayed after a choice and
    // after Escape, where nobody is looking at a list and nobody can act on it.
    const { sources } = cappedAtFive()
    mount({ widget: 'typeahead', sources })
    const box = screen.getByRole('combobox', { name: 'Canton' })
    const capped = say('options.capped', { shown: 5, total: 12 })

    fireEvent.click(box)
    await waitFor(() => {
      expect(region().textContent).toBe(capped)
    }, WAITING)

    fireEvent.click(screen.getByRole('option', { name: 'Row 2' }))
    expect(region().textContent).toBe('')
    await settle()
    expect(region().textContent).toBe('')

    // Opening it again says it again: that is when it is news.
    fireEvent.keyDown(box, { key: 'ArrowDown' })
    expect(region().textContent).toBe(capped)

    fireEvent.keyDown(box, { key: 'Escape' })
    expect(region().textContent).toBe('')

    fireEvent.click(box)
    expect(region().textContent).toBe(capped)
  })

  test('a search that settles on what is already said writes nothing to the region', async () => {
    // The repetition the issue measured: every debounced search took the region through
    // "Searching…" and back to the same sentence, so a screen reader heard the cut list
    // announced again after every keystroke. Held while the next search is in flight, the
    // sentence that still describes the rows on screen is never taken away, and an answer
    // that leaves it standing changes nothing anybody hears.
    const pending: Array<{ query: string; settle: () => void }> = []
    mount({
      widget: 'typeahead',
      sources: {
        cantons: {
          debounceMs: 0,
          maxRows: 5,
          resolve: (request) =>
            new Promise((resolve) => {
              pending.push({ query: request.query, settle: () => resolve(MANY) })
            }),
        },
      },
    })
    const box = screen.getByRole('combobox', { name: 'Canton' })
    const capped = say('options.capped', { shown: 5, total: 12 })

    fireEvent.change(box, { target: { value: 'r' } })
    await waitFor(() => {
      expect(pending.some((request) => request.query === 'r')).toBe(true)
    }, WAITING)
    await act(async () => {
      for (const request of pending) request.settle()
    })
    await waitFor(() => {
      expect(region().textContent).toBe(capped)
    }, WAITING)

    const changes: MutationRecord[] = []
    const observer = new MutationObserver((records) => changes.push(...records))
    observer.observe(region(), { childList: true, characterData: true, subtree: true })

    fireEvent.change(box, { target: { value: 'ro' } })
    // The search really is in flight, so the silence below is a held sentence and not a
    // search that never ran.
    await waitFor(() => {
      expect(box.getAttribute('aria-busy')).toBe('true')
    }, WAITING)
    await act(async () => {
      pending.find((request) => request.query === 'ro')!.settle()
    })
    await waitFor(() => {
      expect(box.getAttribute('aria-busy')).toBeNull()
    }, WAITING)
    changes.push(...observer.takeRecords())
    observer.disconnect()

    expect(changes).toHaveLength(0)
    expect(region().textContent).toBe(capped)
  })

  test('says what was withheld when nothing else is left out, and that there are more over it', async () => {
    // A source that cannot hand a row over withholds and counts it rather than dropping it
    // silently. While more rows match, that count covers only this page — a lower bound —
    // so "more" is said and the number is not.
    const { sources } = by((request) => ({ options: CANTONS, more: request.query === 'b', withheld: 2 }))
    mount({ widget: 'typeahead', sources })
    const box = screen.getByRole('combobox', { name: 'Canton' })

    fireEvent.change(box, { target: { value: 'a' } })
    await waitFor(() => {
      expect(region().textContent).toBe(say('options.withheld', { count: 2 }))
    }, WAITING)

    fireEvent.change(box, { target: { value: 'b' } })
    await waitFor(() => {
      expect(region().textContent).toBe(say('options.more', { count: 3 }))
    }, WAITING)
  })

  test('a page with a key it does not know is a failure, not a list', async () => {
    // A misspelt `moer: true`, or a `total` read as nothing, would show a cut list as the
    // whole one. Refused whole, it is a source that failed, which the field says.
    const { sources } = by(() => ({ options: CANTONS, more: false, total: 40 }))
    mount({ widget: 'typeahead', sources })

    fireEvent.change(screen.getByRole('combobox', { name: 'Canton' }), { target: { value: 'z' } })

    await waitFor(() => {
      expect(region().textContent).toBe(say('options.failed'))
    }, WAITING)
    expect(screen.queryAllByRole('option', { hidden: true })).toHaveLength(0)
  })

  /**
   * A sentence is held through a search only while it describes the rows on screen. Each
   * of the three ways those rows go — a failure, an answer refused whole, a query under
   * the minimum — empties the list, and a sentence kept past it said "the first 5 of 12"
   * over a list with nothing in it.
   */
  async function searchAfter(between: string, answer?: () => Promise<never>): Promise<void> {
    mount({
      widget: 'typeahead',
      sources: {
        cantons: {
          debounceMs: 0,
          maxRows: 5,
          minQueryLength: 2,
          resolve: (request) => {
            if (request.query === 'ab') return Promise.resolve(MANY)
            if (request.query === between && answer !== undefined) return answer()
            return new Promise(() => undefined)
          },
        },
      },
    })
    const box = screen.getByRole('combobox', { name: 'Canton' })

    fireEvent.change(box, { target: { value: 'ab' } })
    await waitFor(() => {
      expect(region().textContent).toBe(say('options.capped', { shown: 5, total: 12 }))
    }, WAITING)
    fireEvent.change(box, { target: { value: between } })
    await waitFor(() => {
      expect(region().textContent).toBe(answer === undefined ? say('options.tooShort', { count: 2 }) : say('options.failed'))
    }, WAITING)

    fireEvent.change(box, { target: { value: 'abz' } })
    await waitFor(() => {
      expect(box.getAttribute('aria-busy')).toBe('true')
    }, WAITING)
    expect(region().textContent).toBe(say('options.searching'))
  }

  test('a search after a failure says it is searching, not what the failed list left out', async () => {
    await searchAfter('abc', () => Promise.reject(new Error('down')))
  })

  test('a search after an answer refused whole says it is searching, not what the refused list left out', async () => {
    await searchAfter('abc', () => Promise.resolve({ options: CANTONS, more: 'yes' } as never))
  })

  test('a search after dropping under the minimum says it is searching, not what the emptied list left out', async () => {
    await searchAfter('a')
  })
})

describe('a plain select over a source, which nobody can type into', () => {
  test('asks nothing more when an answer is chosen or the field is left', async () => {
    // A select asks once, for the empty query. Moving to it asks again only after a
    // failure, so choosing an answer and leaving the field — each a change to the field's
    // state — must not send the same unchanged question to the source again.
    const { sources, asked } = answering()
    mount({ sources })
    await waitFor(() => {
      expect(screen.getAllByRole('option')).toHaveLength(4)
    }, WAITING)

    const select = screen.getByRole('combobox', { name: 'Canton' })
    fireEvent.change(select, { target: { value: 'BE' } })
    act(() => select.focus())
    act(() => select.blur())
    await settle(20)

    expect(asked.filter((request) => request.kind === 'search')).toHaveLength(1)
  })

  test('says how many it shows in words of its own, and never asks anybody to keep typing', async () => {
    // "Keep typing to narrow" under a control nobody can type into, past its cap, and the
    // same borrowed sentence over a page that goes on.
    const { sources } = cappedAtFive()
    mount({ sources })
    await waitFor(() => {
      expect(region().textContent).toBe(say('options.cappedListed', { count: 5, total: 12 }))
    }, WAITING)
    expect(region().textContent).not.toBe(say('options.capped', { shown: 5, total: 12 }))
    cleanup()

    mount({ sources: paging().sources })
    await waitFor(() => {
      expect(region().textContent).toBe(say('options.moreListed', { count: 5 }))
    }, WAITING)
    expect(region().textContent).not.toBe(say('options.more', { count: 5 }))
  })

  test('over a source that answers only a search, says so and asks nothing', async () => {
    // A select's query is always empty, so "type at least 2 characters" asked for what
    // the control cannot take, over a source that will never be asked.
    const { sources, asked } = by(() => CANTONS, { minQueryLength: 2 })
    mount({ sources })

    await settle(20)

    expect(region().textContent).toBe(say('options.searchOnly'))
    expect(asked.filter((request) => request.kind === 'search')).toEqual([])
  })

  test('whose source failed says so in its own words, and asks again when the person moves to it', async () => {
    // The select that could never try again: its sentence said "Type to try again" under a
    // control nobody can type into, and its query never changes, so nothing ever re-asked.
    // Focus comes before every way of opening a native select, by pointer or by keyboard.
    const searches: OptionsRequest[] = []
    mount({
      sources: {
        cantons: {
          debounceMs: 0,
          resolve: (request) => {
            if (request.kind === 'search') searches.push(request)
            return searches.length === 1 ? Promise.reject(new Error('down')) : Promise.resolve(CANTONS)
          },
        },
      },
    })
    const select = screen.getByRole('combobox', { name: 'Canton' })

    await waitFor(() => {
      expect(region().textContent).toBe(say('options.failedListed'))
    }, WAITING)
    expect(searches).toHaveLength(1)

    act(() => select.focus())

    await waitFor(() => {
      expect(screen.getAllByRole('option')).toHaveLength(4)
    }, WAITING)
    expect(searches).toHaveLength(2)
    expect(region().textContent).toBe('')

    // Moving to it when nothing failed asks nothing: a select is not refetched on every visit.
    act(() => select.blur())
    act(() => select.focus())
    await settle(20)
    expect(searches).toHaveLength(2)
  })
})

describe('a sourced control a rule disables', () => {
  test.each([
    ['a select', undefined],
    ['a typeahead', 'typeahead' as const],
  ])('%s asks only for the name of what it holds, and says nothing', async (_, widget) => {
    // A form that opens a saved record read-only said "keep typing to narrow" under every
    // long lookup, and read a page from the source for each one nobody could open. It
    // still names what it holds, or a saved answer would show as a bare value.
    const { sources, asked } = answering()
    mount({
      ...(widget === undefined ? {} : { widget }),
      sources,
      initialValue: { canton: 'VD' },
      logic: { rules: DISABLED },
    })
    const box = screen.getByRole('combobox', { name: 'Canton' })

    await waitFor(() => {
      if (widget === 'typeahead') expect((box as HTMLInputElement).value).toBe('Vaud')
      else expect(screen.getByRole('option', { name: 'Vaud', selected: true })).toBeDefined()
    }, WAITING)
    await settle(20)

    expect(asked.filter((request) => request.kind === 'search')).toEqual([])
    expect(asked.filter((request) => request.kind === 'labels').map((request) => request.values)).toEqual([['VD']])
    expect(region().textContent).toBe('')
    expect(box.getAttribute('aria-busy')).toBeNull()
  })

  test.each([
    ['a select', undefined],
    ['a typeahead', 'typeahead' as const],
  ])('%s over a source that answers only a search says nothing about searching', async (_, widget) => {
    // The minimum is the one sentence that does not wait for an answer, so a disabled
    // field said "type at least 2 characters" into a box nobody can type into.
    const { sources } = by(() => CANTONS, { minQueryLength: 2 })
    mount({ ...(widget === undefined ? {} : { widget }), sources, logic: { rules: DISABLED } })

    await settle(20)

    expect(region().textContent).toBe('')
  })

  test('a control disabled while its search is in flight reports no failure and is not busy', async () => {
    // Disabling aborts the search, and an abort that lands in a handler still believing it
    // is current reports the source as broken under a field nobody can change, or leaves
    // the box marked busy with nothing in flight — the reason the generation moves first.
    const signals: AbortSignal[] = []
    const engine = mount({
      widget: 'typeahead',
      ...LOCKABLE,
      sources: {
        cantons: {
          debounceMs: 0,
          resolve: (request) =>
            new Promise((_, reject) => {
              signals.push(request.signal)
              // As `fetch` does: the abort is the only way this settles.
              request.signal.addEventListener('abort', () => {
                reject(new DOMException('aborted', 'AbortError'))
              })
            }),
        },
      },
    })
    const box = screen.getByRole('combobox', { name: 'Canton' })

    fireEvent.change(box, { target: { value: 'z' } })
    await waitFor(() => {
      expect(box.getAttribute('aria-busy')).toBe('true')
    }, WAITING)

    act(() => {
      engine.setValue(['locked'], true)
    })
    await settle(20)

    expect(box).toHaveProperty('disabled', true)
    expect(box.getAttribute('aria-busy')).toBeNull()
    // The host is told nobody wants the answer.
    expect(signals.at(-1)?.aborted).toBe(true)
    // Read off the attribute every theme styles a failure by: the text is empty either way,
    // because a disabled control says nothing.
    expect(region().getAttribute('data-state')).toBeNull()
    expect(region().textContent).toBe('')
  })

  test('a typeahead disabled while its list is open draws no list and says nothing', async () => {
    // A rule disabling the field while its list showed left the list on screen and
    // `aria-expanded` true, with rows a click would still store into a field nobody may
    // change. A box disabled under the person is not reliably blurred — jsdom fires no blur —
    // so only the rule can hide what it made read-only.
    const engine = mount({ widget: 'typeahead', ...LOCKABLE, sources: answering().sources })
    const box = screen.getByRole('combobox', { name: 'Canton' })
    fireEvent.click(box)
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Zürich' })).toBeDefined()
    }, WAITING)
    expect(box.getAttribute('aria-expanded')).toBe('true')

    act(() => {
      engine.setValue(['locked'], true)
    })

    expect(box).toHaveProperty('disabled', true)
    expect(box.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(screen.queryByRole('option')).toBeNull()
    expect(region().textContent).toBe('')
    expect(region().getAttribute('data-state')).toBeNull()

    // Hidden, not closed: enabled again before anything closed it, the list the person had
    // open shows again, as Angular's does. 0177 states this as a cost.
    act(() => {
      engine.setValue(['locked'], false)
    })
    await waitFor(() => {
      expect(box.getAttribute('aria-expanded')).toBe('true')
      expect(screen.getByRole('option', { name: 'Zürich' })).toBeDefined()
    }, WAITING)
  })

  test('a control disabled after its search failed shows no failure', async () => {
    // A source that was down when the record opened stayed drawn as a failure under a
    // field a rule has since made read-only, where nobody can do anything about it.
    const engine = mount({
      widget: 'typeahead',
      ...LOCKABLE,
      sources: { cantons: { debounceMs: 0, resolve: () => Promise.reject(new Error('down')) } },
    })
    await waitFor(() => {
      expect(region().textContent).toBe(say('options.failed'))
    }, WAITING)
    expect(region().getAttribute('data-state')).toBe('failed')

    act(() => {
      engine.setValue(['locked'], true)
    })

    expect(screen.getByRole('combobox', { name: 'Canton' })).toHaveProperty('disabled', true)
    expect(region().textContent).toBe('')
    expect(region().getAttribute('data-state')).toBeNull()
  })

  test('names what it holds from a page as it does from a list', async () => {
    // A labels request answered with a page — the natural shape for a source that pages —
    // was refused as a malformed list, so a disabled field, which asks for nothing else,
    // showed a bare stored value.
    const { sources, asked } = by((request) => ({
      options: CANTONS.filter((row) => request.values.includes(row.value)),
      more: false,
    }))
    mount({ widget: 'typeahead', sources, initialValue: { canton: 'VD' }, logic: { rules: DISABLED } })

    await waitFor(() => {
      expect(screen.getByRole<HTMLInputElement>('combobox', { name: 'Canton' }).value).toBe('Vaud')
    }, WAITING)
    expect(asked.map((request) => request.kind)).toEqual(['labels'])
  })

  test.each([
    ['refused', () => ({ options: [{ value: 'VD', label: 'Vaud' }], more: false, total: 1 })],
    ['not given', () => Promise.reject(new Error('down'))],
  ])('shows the stored value itself when its name is %s', async (_, answer) => {
    // A name that cannot be had blanked the answer the form holds, or was read as the
    // source failing under a field nobody can change. A labels answer goes through the same
    // gate as a search, so a page with a key nobody knows names nothing here either: read
    // leniently, its `options` would name a value from an answer the search refuses. This
    // held before this change too; it is here because the gate it goes through is new.
    const { sources, asked } = by(answer)
    mount({ widget: 'typeahead', sources, initialValue: { canton: 'VD' }, logic: { rules: DISABLED } })
    const box = screen.getByRole<HTMLInputElement>('combobox', { name: 'Canton' })

    await waitFor(() => {
      expect(asked.map((request) => request.kind)).toEqual(['labels'])
    }, WAITING)
    await settle(20)

    expect(box.value).toBe('VD')
    expect(region().textContent).toBe('')
  })
})

describe('an auditor over what a sourced control says', () => {
  /** The conformance suite's rule set, as `typeahead-widget.test.tsx` runs it. */
  async function violationsNow(): Promise<string[]> {
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
    mount({ widget: 'typeahead', sources: paging().sources })
    fireEvent.change(screen.getByRole('combobox', { name: 'Canton' }), { target: { value: 'r' } })
    await waitFor(() => {
      expect(region().textContent).toBe(say('options.more', { count: 5 }))
    }, WAITING)
    expect(await violationsNow()).toEqual([])
    cleanup()

    mount({ sources: { cantons: { debounceMs: 0, resolve: () => Promise.reject(new Error('down')) } } })
    await waitFor(() => {
      expect(region().textContent).toBe(say('options.failedListed'))
    }, WAITING)
    expect(await violationsNow()).toEqual([])
    cleanup()

    mount({ widget: 'typeahead', sources: answering().sources, initialValue: { canton: 'VD' }, logic: { rules: DISABLED } })
    await waitFor(() => {
      expect(screen.getByRole<HTMLInputElement>('combobox', { name: 'Canton' }).value).toBe('Vaud')
    }, WAITING)
    expect(await violationsNow()).toEqual([])
  }, 20_000)
})
