import { useCallback, useEffect, useRef, useState } from 'react'
import { acceptRemoteAnswer, capRemoteAnswer } from '@formancy/spec'
import type { FieldDef, RemoteCompleteness, RemoteOption } from '@formancy/spec'
import { useFormEngine } from './context.js'
import { useOptionsSources } from './options-source.js'

/**
 * A field's options, from the document or from the deployment.
 *
 * One hook for every control over a source — the plain `<select>`, the `typeahead`, a list
 * of ticks and the tag picker — because `optionsSource` decides which answers EXIST rather
 * than how they are shown, so a control that ignored it would render an empty chooser over
 * a field that collects something. The ticks and the tag picker hold a list, so what is
 * stored is a list of values here, a select's one answer being a list of one (0215).
 *
 * `unavailable` is the file field's branch, not the scanner's. A text field with no
 * scanner still collects by typing; a select whose options come only from a source
 * collects nothing at all, so the control says so instead of rendering an empty
 * chooser somebody would stare at.
 *
 * `labels` is not a nicety. With no document options there is no list on mount, so a
 * resumed draft, a wizard page change or a datagrid row move — which remounts every
 * control in the row by design — would render an empty box over a stored answer.
 * Until the names arrive the control shows the raw value, which is what it already
 * does for an authored option whose label is missing.
 *
 * A failure is reported and never thrown: a source being down is not a wrong answer,
 * so it belongs in the field's own status region rather than in the error region that
 * carries the engine's verdict.
 *
 * What the region SAYS is not decided here. The hook reports where the source stands,
 * and each control hands that to `optionsStatus` with what only it knows — whether its
 * list is open, whether anybody can type into it — because the sentence is one decision
 * both renderers read, not two copies of it
 * ([0177](../../../docs/decisions/0177-a-source-may-say-its-list-goes-on.md)).
 */

export interface SourcedOptions {
  /** What the control should offer right now. */
  options: ReadonlyArray<{ value: string; label: string }>
  /** Null when the document carries its own options — the ordinary case. */
  remote: RemoteState | null
}

export interface RemoteState {
  /** The document names a source this deployment does not have. */
  unavailable: boolean
  /** A request is in flight, and the control says `aria-busy` rather than disabling. */
  busy: boolean
  /**
   * The last request failed. Its own flag, so a theme's `data-state` is read off the
   * state and not off the sentence — which keyed on English prose, and would have
   * stopped matching the day the sentence was said in German (0171).
   */
  failed: boolean
  /** How many characters are still needed before anything is asked. */
  needs: number
  /**
   * What the last settled answer left out. Kept while a newer search is in flight,
   * because the rows on screen are still that answer's, so its sentence still describes
   * them; reset only where those rows stop being shown — a failure, a refusal, a query
   * under the minimum, a disabled field.
   */
  completeness: RemoteCompleteness
  /**
   * Ask again. A select's only way back from a failure: nobody can type into one and its
   * query never changes, so without this a source that was down once stayed down for as
   * long as the form was open.
   */
  retry(): void
}

const DEBOUNCE_MS = 250
const MIN_QUERY = 0
const MAX_ROWS = 50

/**
 * Nothing left out, as one value: a reset that stores it again is the same state, so
 * React bails out of the render rather than repeating one.
 */
const COMPLETE: RemoteCompleteness = { kind: 'complete' }

export function useSourcedOptions(
  field: { def: FieldDef; value: unknown; path: string; disabled: boolean },
  query: string,
  /**
   * Whether this instance is the one that will render.
   *
   * `SelectField` calls this hook and then hands over to the typeahead when the
   * field carries that widget — and React will not let it skip a hook, because the
   * builder can set a widget on a live document and a changed hook count is an
   * error. So both instances exist and only one asks: measured, the parent's was
   * sending a second request for the empty query that nobody ever read.
   */
  enabled = true,
): SourcedOptions {
  const engine = useFormEngine()
  const sources = useOptionsSources()
  const name = field.def.optionsSource
  const source = name === undefined ? undefined : sources?.[name]

  const [rows, setRows] = useState<readonly RemoteOption[]>([])
  const [named, setNamed] = useState<ReadonlyMap<string, string>>(new Map())
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [completeness, setCompleteness] = useState<RemoteCompleteness>(COMPLETE)
  // A dependency of the search and nothing else: bumping it is how `retry` asks again
  // for the same query, which no other input of the effect would change.
  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => setAttempt((was) => was + 1), [])

  const debounceMs = source?.debounceMs ?? DEBOUNCE_MS
  const minQueryLength = source?.minQueryLength ?? MIN_QUERY
  const maxRows = source?.maxRows ?? MAX_ROWS
  const stored = storedValues(field.value)
  // A new array on every render, so the names below are asked for by what it holds.
  const storedKey = stored.join('\u0000')
  // The field's DATA PATH, which is what `OptionsRequest.path` promises — `canton`, or
  // `people[1].canton` inside a repeater. It sent `def.key` before, so a resolver could
  // not tell two same-named sourced fields apart and never saw which row it was
  // answering for. The contract said one thing and the code did another.
  const path = field.path
  const disabled = field.disabled

  /*
   * The search. Debounced, and superseded by aborting rather than by ignoring: a
   * request nobody wants any more is a request a host should be able to cancel, and
   * the signal is the only way to tell it so.
   */
  const asked = useRef(0)
  useEffect(() => {
    // Bumped BEFORE every early return, not after them. Deleting characters back under
    // the minimum aborts whatever is in flight, and with the generation unchanged that
    // abort arrived at a `.catch` that still believed it was current — so backspacing
    // reported "The options could not be loaded" for a source that was working. It
    // also left `busy` set, because the `.finally` that clears it is guarded the same
    // way and the superseding request never started. Disabling the field is the same
    // abort by another route.
    const generation = (asked.current += 1)
    if (!enabled || source === undefined) return

    // A disabled field asks for no page: nobody can choose from it, so a search would
    // be a read from the source for a list nobody opens, and its sentence a status
    // under a read-only record. The labels effect below still names what it holds.
    if (disabled) {
      setBusy(false)
      setFailed(false)
      setCompleteness(COMPLETE)
      return
    }

    if (query.trim().length < minQueryLength) {
      setRows([])
      setCompleteness(COMPLETE)
      setBusy(false)
      return
    }

    const controller = new AbortController()
    const timer = setTimeout(() => {
      // Busy only once a request is actually on its way — after the debounce — so
      // nothing announces per keystroke. What the last answer left out is NOT reset
      // here: those rows are still on screen, and a sentence held through the search
      // is a sentence nobody hears twice.
      setBusy(true)
      setFailed(false)
      void source
        .resolve({
          kind: 'search',
          source: name ?? '',
          path,
          query,
          values: [],
          locale: engine.locale(),
          limit: maxRows,
          signal: controller.signal,
        })
        .then((answer) => {
          if (generation !== asked.current) return
          // Refused whole rather than filtered: a partial list silently lacks the row
          // somebody came for, and they cannot tell that from a source that has none.
          // A page is held to the same rule, an unknown key included.
          const accepted = acceptRemoteAnswer(answer)
          if (accepted === undefined) {
            setFailed(true)
            setRows([])
            setCompleteness(COMPLETE)
            return
          }
          const settled = capRemoteAnswer(accepted, maxRows)
          setRows(settled.shown)
          setCompleteness(settled.completeness)
        })
        .catch(() => {
          if (generation !== asked.current) return
          setFailed(true)
          setRows([])
          setCompleteness(COMPLETE)
        })
        .finally(() => {
          if (generation === asked.current) setBusy(false)
        })
    }, debounceMs)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [enabled, disabled, source, name, path, query, minQueryLength, maxRows, debounceMs, engine, attempt])

  /*
   * The names of what is already stored. Asked at most ONCE per value, and remembered
   * as "asked" rather than inferred from the answer.
   *
   * That distinction is the whole of it. The first version asked again unless the
   * answer contained the value — and a source is entitled not to know it: a resumed
   * form may hold a value the list no longer offers, and a host may implement only
   * `kind: 'search'`. The answer still replaced the map, a new map is a new dependency
   * identity, the effect re-ran, and it asked again. Measured: **602 requests in 300
   * milliseconds**, with no "maximum update depth" to notice it by, because every turn
   * went through a promise.
   */
  const askedFor = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!enabled || source === undefined || storedKey === '') return
    // Every value not yet asked about, in one request: a list of ticks resumed with five
    // answers asks once, not five times.
    const unnamed = storedKey.split('\u0000').filter((value) => !named.has(value) && !askedFor.current.has(value))
    if (unnamed.length === 0) return
    for (const value of unnamed) askedFor.current.add(value)

    const controller = new AbortController()
    void source
      .resolve({
        kind: 'labels',
        source: name ?? '',
        path,
        query: '',
        values: unnamed,
        locale: engine.locale(),
        limit: unnamed.length,
        signal: controller.signal,
      })
      .then((answer) => {
        // Either shape: a source that pages answers its labels the way it answers a
        // search, and nothing about a name asked for needs `more` or `withheld`.
        const accepted = acceptRemoteAnswer(answer)
        if (accepted === undefined) return
        setNamed((was) => {
          const next = new Map(was)
          for (const row of accepted.options) next.set(row.value, row.label)
          return next
        })
      })
      // A name that does not arrive is not an error anybody can act on: the control
      // shows the raw value, exactly as it does for an authored option with no label.
      .catch(() => undefined)

    return () => controller.abort()
  }, [enabled, source, name, path, storedKey, named, engine])

  if (name === undefined) {
    return {
      options: (field.def.options ?? []).map((option) => ({
        value: option.value,
        label: engine.text(option.label) ?? option.value,
      })),
      remote: null,
    }
  }

  // A stored answer is always offerable, even when the current query does not match it: a
  // control that dropped it would show an empty box over an answer the form holds, and the
  // next blur would look like the person cleared it — or, in a list of ticks, an untick
  // nobody could make.
  const unlisted = stored.filter((value) => !rows.some((row) => row.value === value))
  const offered = [...unlisted.map((value) => ({ value, label: named.get(value) ?? value })), ...rows]

  return {
    options: offered,
    remote: {
      unavailable: source === undefined,
      busy,
      failed,
      needs: minQueryLength,
      completeness,
      retry,
    },
  }
}

/** A select's one answer, or a list's every answer, as the values a source is asked to name. */
function storedValues(value: unknown): string[] {
  if (typeof value === 'string') return value === '' ? [] : [value]
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item !== '')
}
