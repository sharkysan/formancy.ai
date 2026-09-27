import { DestroyRef, computed, effect, inject, signal } from '@angular/core'
import type { Signal, WritableSignal } from '@angular/core'
import { acceptRemoteOptions, capRemoteOptions } from '@formancy/spec'
import type { RemoteOption } from '@formancy/spec'
import { injectOptionsSources } from './options-source.js'

/**
 * A field's options, from the document or from the deployment.
 *
 * The same contract the React binding states in `use-sourced-options.ts`, written
 * out here rather than shared: the async lifecycle is expressed in this framework's
 * own primitives, and a shared abstraction would report that both bindings
 * implemented it when one had not.
 *
 * `optionsSource` decides which answers EXIST rather than how they are shown, so the
 * plain `<select>` honours it as well as the typeahead — one ignoring it would render
 * an empty chooser over a field that collects something.
 */

export interface SourcedOptionsState {
  /** The rows a source returned, empty until one does. */
  rows: Signal<readonly RemoteOption[]>
  /** Names for values the form already holds, so a resumed draft is not blank. */
  named: Signal<ReadonlyMap<string, string>>
  /** The document names a source this deployment does not have. */
  unavailable: Signal<boolean>
  /** A request is in flight. The control says `aria-busy`; it never disables itself. */
  busy: Signal<boolean>
  /** The one thing the field says out loud, or the empty string. */
  status: Signal<string>
  /** Whether this field is sourced at all. False is the ordinary case. */
  sourced: Signal<boolean>
}

const DEBOUNCE_MS = 250
const MIN_QUERY = 0
const MAX_ROWS = 50

/**
 * Wire a field's remote options up.
 *
 * Called from a component's field context, so it may inject. `query` is the signal
 * the control types into; a plain select passes a constant empty one, which asks the
 * source for everything and shows what fits.
 */
export function injectSourcedOptions(
  definition: Signal<{ optionsSource?: string; key: string }>,
  storedValue: Signal<string | undefined>,
  query: Signal<string>,
  locale: () => string,
): SourcedOptionsState {
  const sources = injectOptionsSources()
  const destroyRef = inject(DestroyRef)

  const rows: WritableSignal<readonly RemoteOption[]> = signal([])
  const named: WritableSignal<ReadonlyMap<string, string>> = signal(new Map())
  const busy = signal(false)
  const failed = signal(false)
  const capped = signal<{ shown: number; total: number } | null>(null)

  const source = () => {
    const name = definition().optionsSource
    return name === undefined ? undefined : sources?.[name]
  }

  let generation = 0
  let inFlight: AbortController | undefined
  let timer: ReturnType<typeof setTimeout> | undefined

  const stop = (): void => {
    if (timer !== undefined) clearTimeout(timer)
    inFlight?.abort()
  }
  destroyRef.onDestroy(stop)

  // The search, debounced and superseded by ABORTING rather than by ignoring: a
  // request nobody wants any more is one a host should be able to cancel, and the
  // signal is the only way to say so.
  effect(() => {
    const resolver = source()
    const text = query()
    const name = definition().optionsSource ?? ''
    const path = definition().key
    if (resolver === undefined) return

    const minQueryLength = resolver.minQueryLength ?? MIN_QUERY
    const maxRows = resolver.maxRows ?? MAX_ROWS

    stop()
    if (text.trim().length < minQueryLength) {
      rows.set([])
      capped.set(null)
      return
    }

    const mine = (generation += 1)
    const controller = new AbortController()
    inFlight = controller
    timer = setTimeout(() => {
      busy.set(true)
      failed.set(false)
      void resolver
        .resolve({
          kind: 'search',
          source: name,
          path,
          query: text,
          values: [],
          locale: locale(),
          limit: maxRows,
          signal: controller.signal,
        })
        .then((answer) => {
          if (mine !== generation) return
          // Refused whole rather than filtered: a partial list silently lacks the row
          // somebody came for, and they cannot tell that from a source that has none.
          const accepted = acceptRemoteOptions(answer)
          if (accepted === undefined) {
            failed.set(true)
            rows.set([])
            capped.set(null)
            return
          }
          const result = capRemoteOptions(accepted, maxRows)
          rows.set(result.shown)
          capped.set(result.capped ? { shown: result.shown.length, total: result.total } : null)
        })
        .catch(() => {
          if (mine !== generation) return
          failed.set(true)
          rows.set([])
        })
        .finally(() => {
          if (mine === generation) busy.set(false)
        })
    }, resolver.debounceMs ?? DEBOUNCE_MS)
  })

  // The names of what is already stored. Without this, a resumed draft, a wizard page
  // change or a datagrid row move — which remounts every control in the row by design
  // — renders an empty box over an answer the form holds.
  //
  // Asked at most ONCE per value, and remembered as "asked" rather than inferred from
  // the answer. A source is entitled not to know a value: a resumed form may hold one
  // the list no longer offers, and a host may implement only `kind: 'search'`. Inferring
  // from the answer meant the map was replaced, the signal changed, the effect re-ran
  // and it asked again — measured in the React binding at 602 requests in 300ms.
  const askedFor = new Set<string>()
  effect(() => {
    const resolver = source()
    const value = storedValue()
    if (resolver === undefined || value === undefined) return
    if (named().has(value) || askedFor.has(value)) return
    askedFor.add(value)

    const controller = new AbortController()
    void resolver
      .resolve({
        kind: 'labels',
        source: definition().optionsSource ?? '',
        path: definition().key,
        query: '',
        values: [value],
        locale: locale(),
        limit: 1,
        signal: controller.signal,
      })
      .then((answer) => {
        const accepted = acceptRemoteOptions(answer)
        if (accepted === undefined) return
        const next = new Map(named())
        for (const row of accepted) next.set(row.value, row.label)
        named.set(next)
      })
      // A name that does not arrive is not an error anybody can act on: the control
      // shows the raw value, exactly as it does for an option with no label.
      .catch(() => undefined)
  })

  return {
    rows: rows.asReadonly(),
    named: named.asReadonly(),
    busy: busy.asReadonly(),
    // `computed`, not a bare arrow: the template reads these, and a plain function
    // would re-run on every change detection instead of when its inputs move.
    sourced: computed(() => definition().optionsSource !== undefined),
    unavailable: computed(
      () => definition().optionsSource !== undefined && source() === undefined,
    ),
    status: computed(() => {
      const resolver = source()
      if (resolver === undefined) return ''
      if (failed()) return 'The options could not be loaded. Type to try again.'
      const needs = resolver.minQueryLength ?? MIN_QUERY
      if (query().trim().length < needs) return `Type at least ${String(needs)} characters to search.`
      // Set only once a request is actually on its way — after the debounce — so
      // nothing announces per keystroke.
      if (busy()) return 'Searching…'
      const limit = capped()
      if (limit !== null) {
        return `Showing the first ${String(limit.shown)} of ${String(limit.total)} — keep typing to narrow.`
      }
      return ''
    }),
  }
}
