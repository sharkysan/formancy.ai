import { useEffect, useRef, useState } from 'react'
import { acceptRemoteOptions, capRemoteOptions } from '@formancy/spec'
import type { FieldDef, RemoteOption } from '@formancy/spec'
import { useFormEngine } from './context.js'
import { useOptionsSources } from './options-source.js'

/**
 * A field's options, from the document or from the deployment.
 *
 * One hook for both controls — the plain `<select>` and the `typeahead` — because
 * `optionsSource` decides which answers EXIST rather than how they are shown, so a
 * select that ignored it would render an empty chooser over a field that collects
 * something.
 *
 * ── WHAT THE STATES ARE FOR ──────────────────────────────────────────────────
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
  /** What to announce, or the empty string when there is nothing to say. */
  status: string
  /** How many characters are still needed before anything is asked. */
  needs: number
}

const DEBOUNCE_MS = 250
const MIN_QUERY = 0
const MAX_ROWS = 50

export function useSourcedOptions(
  field: { def: FieldDef; value: unknown },
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
  const [capped, setCapped] = useState<{ shown: number; total: number } | null>(null)

  const debounceMs = source?.debounceMs ?? DEBOUNCE_MS
  const minQueryLength = source?.minQueryLength ?? MIN_QUERY
  const maxRows = source?.maxRows ?? MAX_ROWS
  const stored = typeof field.value === 'string' && field.value !== '' ? field.value : undefined
  const path = field.def.key

  /*
   * The search. Debounced, and superseded by aborting rather than by ignoring: a
   * request nobody wants any more is a request a host should be able to cancel, and
   * the signal is the only way to tell it so.
   */
  const asked = useRef(0)
  useEffect(() => {
    if (!enabled || source === undefined) return
    if (query.trim().length < minQueryLength) {
      setRows([])
      setCapped(null)
      return
    }

    const generation = (asked.current += 1)
    const controller = new AbortController()
    const timer = setTimeout(() => {
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
          const accepted = acceptRemoteOptions(answer)
          if (accepted === undefined) {
            setFailed(true)
            setRows([])
            setCapped(null)
            return
          }
          const { shown, total, capped: wasCapped } = capRemoteOptions(accepted, maxRows)
          setRows(shown)
          setCapped(wasCapped ? { shown: shown.length, total } : null)
        })
        .catch(() => {
          if (generation !== asked.current) return
          setFailed(true)
          setRows([])
        })
        .finally(() => {
          if (generation === asked.current) setBusy(false)
        })
    }, debounceMs)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [enabled, source, name, path, query, minQueryLength, maxRows, debounceMs, engine])

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
    if (!enabled || source === undefined || stored === undefined) return
    if (named.has(stored) || askedFor.current.has(stored)) return
    askedFor.current.add(stored)

    const controller = new AbortController()
    void source
      .resolve({
        kind: 'labels',
        source: name ?? '',
        path,
        query: '',
        values: [stored],
        locale: engine.locale(),
        limit: 1,
        signal: controller.signal,
      })
      .then((answer) => {
        const accepted = acceptRemoteOptions(answer)
        if (accepted === undefined) return
        setNamed((was) => {
          const next = new Map(was)
          for (const row of accepted) next.set(row.value, row.label)
          return next
        })
      })
      // A name that does not arrive is not an error anybody can act on: the control
      // shows the raw value, exactly as it does for an authored option with no label.
      .catch(() => undefined)

    return () => controller.abort()
  }, [enabled, source, name, path, stored, named, engine])

  if (name === undefined) {
    return {
      options: (field.def.options ?? []).map((option) => ({
        value: option.value,
        label: engine.text(option.label) ?? option.value,
      })),
      remote: null,
    }
  }

  // The stored answer is always offerable, even when the current query does not match
  // it: a control that dropped it would show an empty box over an answer the form
  // holds, and the next blur would look like the person cleared it.
  const offered = [...rows]
  if (stored !== undefined && !offered.some((row) => row.value === stored)) {
    offered.unshift({ value: stored, label: named.get(stored) ?? stored })
  }

  return {
    options: offered,
    remote: {
      unavailable: source === undefined,
      busy,
      needs: minQueryLength,
      status: statusFor({
        failed,
        busy,
        needs: minQueryLength,
        query,
        capped,
      }),
    },
  }
}

/**
 * The one thing the field says out loud, and never more than one.
 *
 * Success announces nothing: the listbox and `aria-activedescendant` are the
 * feedback, and a region that spoke on every successful keystroke would talk over
 * them. A failure is a sentence somebody can act on rather than a code.
 */
function statusFor({
  failed,
  busy,
  needs,
  query,
  capped,
}: {
  failed: boolean
  busy: boolean
  needs: number
  query: string
  capped: { shown: number; total: number } | null
}): string {
  if (failed) return 'The options could not be loaded. Type to try again.'
  if (query.trim().length < needs) {
    return `Type at least ${String(needs)} characters to search.`
  }
  // Set only once a request is actually on its way — after the debounce — so nothing
  // announces per keystroke.
  if (busy) return 'Searching…'
  if (capped !== null) {
    return `Showing the first ${String(capped.shown)} of ${String(capped.total)} — keep typing to narrow.`
  }
  return ''
}
