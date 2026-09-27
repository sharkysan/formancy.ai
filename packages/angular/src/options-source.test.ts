import { provideZonelessChangeDetection } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { fireEvent, render, screen, waitFor } from '@testing-library/angular'
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

const CLOCK = { now: () => 0, today: () => '2026-09-27', random: () => 0.5 }

/**
 * `optionsSource` in Angular — the same assertions the React file makes.
 *
 * Deliberately a near-copy rather than a shared helper: two renderers agreeing is
 * the claim this repository rests on, and the way it stops being true is one of them
 * quietly not implementing something while a shared abstraction reports that both
 * did. What IS shared is `acceptRemoteOptions` in `@formancy/spec`, because a rule
 * that took a row here and refused it in React would be two forms from one document.
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

async function mount({
  widget,
  sources,
  initialValue,
  locale,
}: {
  widget?: 'typeahead'
  sources?: OptionsSources
  initialValue?: Record<string, unknown>
  locale?: string
} = {}): Promise<{ engine: FormEngine; settle: () => Promise<void> }> {
  const engine = createFormEngine({
    schema: schema(widget),
    capabilities: CLOCK,
    ...(initialValue === undefined ? {} : { initialValue }),
    ...(locale === undefined ? {} : { locale }),
  })
  const view = await render(FormancyForm, {
    providers: [
      provideZonelessChangeDetection(),
      provideFormancy(engine),
      ...(sources === undefined ? [] : [provideFormancyOptionsSources(sources)]),
    ],
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

    await until(settle, () => {expect(screen.getAllByRole('option').map((option) => option.textContent?.trim())).toEqual([
        '',
        'Zürich',
        'Bern',
        'Vaud',
      ])
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

    await until(settle, () => {expect(screen.getAllByRole('option')).toHaveLength(4)
    })
    fireEvent.change(screen.getByRole('combobox', { name: 'Canton' }), { target: { value: 'BE' } })
    await settle()

    expect(engine.value()).toEqual({ canton: 'BE' })
  })

  test('refuses the whole list when one row is unusable', async () => {
    const { sources } = answering([{ value: 'ZH', label: 'Zürich' }, { value: 'BE' }] as never)
    const { settle } = await mount({ sources })

    await until(settle, () => {expect(screen.getByText(/could not be loaded/)).toBeDefined()
    })
    expect(screen.getAllByRole('option')).toHaveLength(1)
  })

  test('a source that rejects is reported in the status region, never as an error', async () => {
    const { settle } = await mount({
      sources: { cantons: { debounceMs: 0, resolve: () => Promise.reject(new Error('down')) } },
    })

    await until(settle, () => {expect(screen.getByText(/The options could not be loaded/)).toBeDefined()
    })
    const field = screen
      .getByRole('combobox', { name: 'Canton' })
      .closest('[data-formancy-part="field"]')
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
    await until(settle, () => {expect(screen.getAllByRole('option')).toHaveLength(3)
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

    await until(settle, () => {expect(box.getAttribute('aria-busy')).toBe('true')
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

    await until(settle, () => {expect(screen.getByText(/Showing the first 5 of 12/)).toBeDefined()
    })
  })

  test('asks nothing at all below the length a source set', async () => {
    const { sources, asked } = answering()
    const withMinimum: OptionsSources = { cantons: { ...sources['cantons']!, minQueryLength: 3 } }
    const { settle } = await mount({ widget: 'typeahead', sources: withMinimum })

    fireEvent.input(screen.getByRole('combobox', { name: 'Canton' }), { target: { value: 'be' } })
    await settle()

    await until(settle, () => {expect(screen.getByText(/Type at least 3 characters/)).toBeDefined()
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
