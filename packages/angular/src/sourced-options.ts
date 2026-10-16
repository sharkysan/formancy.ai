import { DestroyRef, computed, effect, inject, signal } from '@angular/core'
import type { Signal, WritableSignal } from '@angular/core'
import { acceptRemoteAnswer, capRemoteAnswer } from '@formancy/spec'
import type { RemoteCompleteness, RemoteOption } from '@formancy/spec'
import { injectOptionsSources } from './options-source.js'

/**
 * A field's options, from the document or from the deployment.
 *
 * The same contract the React binding states in `use-sourced-options.ts`, written
 * out here rather than shared: the async lifecycle is expressed in this framework's
 * own primitives, and a shared abstraction would report that both bindings
 * implemented it when one had not. What a control SAYS about it is not decided here:
 * `optionsStatus` in `@formancy/core/words` decides that once, for both (0177).
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
  /**
   * The last request failed, or its answer was refused. Its own signal, so a theme's
   * `data-state` is read off the state and not off the sentence — which keyed on English
   * prose, and would have stopped matching the day the sentence was said in German (0171).
   */
  failed: Signal<boolean>
  /**
   * What the last SETTLED answer left out, kept while a newer search is in flight: the
   * rows on screen are still that answer's, and a search that settles on the same
   * sentence then changes nothing a screen reader would hear again.
   */
  completeness: Signal<RemoteCompleteness>
  /** The source's minimum query length, or 0. */
  needs: Signal<number>
  /** Whether this field is sourced at all. False is the ordinary case. */
  sourced: Signal<boolean>
  /**
   * Ask again what was last asked. A plain select's only way back from a failure: its
   * query never changes, so nothing else would ever ask.
   */
  retry(): void
}

/**
 * What a control hands over, by name.
 *
 * Named rather than positional: `enabled` and `disabled` are two signals of one type,
 * and swapped they would compile and invert the control.
 */
export interface SourcedOptionsInputs {
  /**
   * The source the document names, or undefined for a field that lists its own.
   *
   * The name, not the field's definition: a signal compares by identity, and a definition
   * rebuilt on every snapshot re-ran the search on every choice and every blur.
   */
  sourceName: Signal<string | undefined>
  /**
   * The field's DATA PATH — `canton`, or `people[1].canton` inside a repeater.
   *
   * Which is what `OptionsRequest.path` promises. Both renderers sent the field KEY,
   * so a resolver could not tell two same-named sourced fields apart and never saw
   * which row it was answering for.
   */
  dataPath: () => string
  storedValue: Signal<string | undefined>
  /** What the control types into; a plain select passes a constant empty one. */
  query: Signal<string>
  locale: () => string
  /**
   * Whether this instance is the one that will render.
   *
   * A select that carries `widget: "typeahead"` delegates to another component, and
   * both extend the same base — so both wire this up and both ask. React added the
   * same flag for the same reason; without it a sourced typeahead sent every request
   * twice, and one set of answers was read by nobody.
   */
  enabled: Signal<boolean>
  /**
   * Disabled by a rule. Nothing is searched for a field nobody can change: it asks only
   * for the name of what it holds.
   */
  disabled: Signal<boolean>
}

const DEBOUNCE_MS = 250
const MIN_QUERY = 0
const MAX_ROWS = 50

/** This binding's "nothing left out", one value, so storing it again is no change. */
const COMPLETE: RemoteCompleteness = { kind: 'complete' }

/**
 * Wire a field's remote options up.
 *
 * Called from a component's field context, so it may inject. A plain select's query
 * is a constant empty one, which asks the source for everything and shows what fits.
 */
export function injectSourcedOptions(inputs: SourcedOptionsInputs): SourcedOptionsState {
  const { sourceName, dataPath, storedValue, query, locale, enabled, disabled } = inputs
  const sources = injectOptionsSources()
  const destroyRef = inject(DestroyRef)

  const rows: WritableSignal<readonly RemoteOption[]> = signal([])
  const named: WritableSignal<ReadonlyMap<string, string>> = signal(new Map())
  const busy = signal(false)
  const failed = signal(false)
  const completeness = signal<RemoteCompleteness>(COMPLETE)
  /** Moved by `retry` and read by the search, so asking again is the search re-running. */
  const attempt = signal(0)

  const source = computed(() => {
    const name = sourceName()
    return name === undefined ? undefined : sources?.[name]
  })

  let generation = 0
  let inFlight: AbortController | undefined
  let timer: ReturnType<typeof setTimeout> | undefined

  /** Every labels request still in the air, so a destroy can abort all of them. */
  const labelRequests = new Set<AbortController>()

  const stop = (): void => {
    if (timer !== undefined) clearTimeout(timer)
    inFlight?.abort()
  }
  destroyRef.onDestroy(() => {
    stop()
    for (const controller of labelRequests) controller.abort()
    labelRequests.clear()
  })

  /** A failed or refused answer: nothing to offer, and nothing it said still stands. */
  const fail = (): void => {
    failed.set(true)
    rows.set([])
    completeness.set(COMPLETE)
  }

  // The search, debounced and superseded by ABORTING rather than by ignoring: a
  // request nobody wants any more is one a host should be able to cancel, and the
  // signal is the only way to say so.
  effect(() => {
    const resolver = source()
    const text = query()
    const name = sourceName() ?? ''
    const path = dataPath()
    const off = disabled()
    attempt()

    stop()
    // Bumped BEFORE every early return, not after one. Deleting characters back under
    // the minimum aborts whatever is in flight, and with the generation unchanged that
    // abort arrived at a handler that still believed it was current -- so backspacing
    // reported the source as broken, and left the box marked busy with nothing in
    // flight. A rule disabling the field mid-search is the same abort.
    const mine = (generation += 1)
    if (!enabled() || resolver === undefined) return

    if (off) {
      // Nothing is searched for a field nobody can change, and nothing said stands.
      busy.set(false)
      failed.set(false)
      completeness.set(COMPLETE)
      return
    }

    const minQueryLength = resolver.minQueryLength ?? MIN_QUERY
    const maxRows = resolver.maxRows ?? MAX_ROWS

    if (text.trim().length < minQueryLength) {
      rows.set([])
      completeness.set(COMPLETE)
      busy.set(false)
      return
    }

    // `completeness` is NOT reset when a search starts: it describes the rows still on
    // screen until the answer that replaces them arrives.
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
          const accepted = acceptRemoteAnswer(answer)
          if (accepted === undefined) {
            fail()
            return
          }
          const result = capRemoteAnswer(accepted, maxRows)
          rows.set(result.shown)
          completeness.set(result.completeness)
        })
        .catch(() => {
          if (mine === generation) fail()
        })
        .finally(() => {
          if (mine === generation) busy.set(false)
        })
    }, resolver.debounceMs ?? DEBOUNCE_MS)
  })

  // The names of what is already stored. Without this, a resumed draft, a wizard page
  // change or a datagrid row move — which remounts every control in the row by design
  // — renders an empty box over an answer the form holds. A disabled field asks too:
  // the name of what it holds is all it shows.
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
    if (!enabled() || resolver === undefined || value === undefined) return
    if (named().has(value) || askedFor.has(value)) return
    askedFor.add(value)

    // Registered, so a destroy aborts it. The search request was; this one was not,
    // which left a request outliving the component that asked for it -- and a host
    // honouring the signal had no way to know nobody was listening any more.
    const controller = new AbortController()
    labelRequests.add(controller)
    void resolver
      .resolve({
        kind: 'labels',
        source: sourceName() ?? '',
        path: dataPath(),
        query: '',
        values: [value],
        locale: locale(),
        limit: 1,
        signal: controller.signal,
      })
      .then((answer) => {
        // Through the same gate as a search, so a page names values as a list does and
        // an answer refused there names nothing here.
        const accepted = acceptRemoteAnswer(answer)
        if (accepted === undefined) return
        const next = new Map(named())
        for (const row of accepted.options) next.set(row.value, row.label)
        named.set(next)
      })
      // A name that does not arrive is not an error anybody can act on: the control
      // shows the raw value, exactly as it does for an option with no label.
      .catch(() => undefined)
      .finally(() => labelRequests.delete(controller))
  })

  return {
    rows: rows.asReadonly(),
    named: named.asReadonly(),
    busy: busy.asReadonly(),
    failed: failed.asReadonly(),
    completeness: completeness.asReadonly(),
    // `computed`, not a bare arrow: the template reads these, and a plain function
    // would re-run on every change detection instead of when its inputs move.
    needs: computed(() => source()?.minQueryLength ?? MIN_QUERY),
    sourced: computed(() => sourceName() !== undefined),
    unavailable: computed(() => sourceName() !== undefined && source() === undefined),
    retry: () => attempt.update((count) => count + 1),
  }
}
