import type { RemoteCompleteness } from '@formancy/spec'
import type { FormText } from './words.js'

/**
 * Where a sourced control stands, as the one sentence it says is decided from.
 *
 * Every field is the renderer's to know; nothing here reads an engine or a DOM. The two
 * controls differ in what a person can do, not in what the source said, so `control` is a
 * field rather than a second function: one order, two vocabularies.
 */
export interface OptionsStatusState {
  /**
   * A `typeahead` or a tag picker takes typing; a plain `select` cannot, and has words of its
   * own; a list of `ticks` cannot either, and asks again from a button when it failed (0215).
   */
  readonly control: 'typeahead' | 'select' | 'ticks'
  /** Whether a typeahead's list is showing. A select has no such event, and passes `true`. */
  readonly open: boolean
  /** Disabled by a rule: nothing it could say is something its person can act on. */
  readonly disabled: boolean
  /** The last request failed, or its answer was refused. */
  readonly failed: boolean
  /** A request is on its way, after the debounce. */
  readonly busy: boolean
  /** The source's minimum query length. */
  readonly needs: number
  /** What was typed. A select's is always empty. */
  readonly query: string
  /** What the last settled answer left out, kept while a newer search is in flight. */
  readonly completeness: RemoteCompleteness
}

/**
 * The one thing a sourced control says out loud, and never more than one.
 *
 * Decided here, once, for both renderers, as what a builder says after a command is
 * ([0116](../../../docs/decisions/0116-what-a-builder-says-is-decided-once.md)): React and
 * Angular each wrote this order by hand, and a control kind, an open list, a disabled field
 * and a held sentence on top of it, in two copies, would drift where nobody looks
 * ([0177](../../../docs/decisions/0177-a-source-may-say-its-list-goes-on.md)).
 *
 * In this order:
 *
 * 1. **Disabled** says nothing: a read-only record does not speak.
 * 2. **A failure**, in the control's words — a select cannot be typed into, and a list of
 *    ticks asks again from a button.
 * 3. **Below the source's minimum**: how many to type, or that a select cannot search.
 * 4. **A closed typeahead** stops there: only what typing fixes is said under a list nobody
 *    is looking at.
 * 5. **What the list leaves out** — more, capped or withheld, whichever `capRemoteAnswer`
 *    decided.
 * 6. **Searching…**, only when nothing above stands.
 *
 * Completeness before searching is the point of the order. While a newer search is in
 * flight the rows on screen are still the last answer's, so its sentence still describes
 * them; held, a search that settles on the same sentence changes nothing in the live
 * region, and nothing is announced again. `aria-busy` is the busy signal meanwhile.
 *
 * Success announces nothing: the listbox and the active option are the feedback, and a
 * region that spoke on every answer would talk over them.
 */
export function optionsStatus(text: FormText, state: OptionsStatusState): string {
  const listed = state.control !== 'typeahead'
  if (state.disabled) return ''
  if (state.failed) {
    if (state.control === 'ticks') return text('options.failedTicks')
    return text(listed ? 'options.failedListed' : 'options.failed')
  }
  if (state.query.trim().length < state.needs) {
    return listed ? text('options.searchOnly') : text('options.tooShort', { count: state.needs })
  }
  if (!listed && !state.open) return ''

  const left = state.completeness
  switch (left.kind) {
    case 'more':
      return text(listed ? 'options.moreListed' : 'options.more', { count: left.shown })
    case 'capped':
      return listed
        ? text('options.cappedListed', { count: left.shown, total: left.total })
        : text('options.capped', { shown: left.shown, total: left.total })
    case 'withheld':
      return text('options.withheld', { count: left.withheld })
    case 'complete':
      return state.busy ? text('options.searching') : ''
  }
}
