import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { createFormEngine } from '@formancy/core'
import type { FormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'

import { FormancyForm, FormancyProvider, OptionsSourcesProvider } from './index.js'
import type { OptionsRequest, OptionsSources } from './index.js'

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
function schema(widget?: 'typeahead'): FormSchema {
  return {
    specVersion: '2',
    id: 'sourced',
    title: 'Sourced',
    model: {
      fields: [
        {
          key: 'canton',
          type: 'select',
          label: 'Canton',
          optionsSource: 'cantons',
          ...(widget === undefined ? {} : { widget }),
        },
      ],
    },
  } as unknown as FormSchema
}

function mount({
  widget,
  sources,
  initialValue,
}: {
  widget?: 'typeahead'
  sources?: OptionsSources
  initialValue?: Record<string, unknown>
} = {}): FormEngine {
  const engine = createFormEngine({
    schema: schema(widget),
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
          return Promise.resolve(
            request.kind === 'labels'
              ? rows.filter((row) => request.values.includes(row.value))
              : rows,
          )
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
      expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
        '',
        'Zürich',
        'Bern',
        'Vaud',
      ])
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

    expect(
      screen.getAllByRole('option').map((option) => option.textContent),
    ).toContain('VD')
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
