import { createContext, useContext } from 'react'
import type { RemoteOptionsAnswer } from '@formancy/spec'

/**
 * What a source is asked for.
 *
 * `kind` is a flat discriminator rather than a union of two interfaces, on the same
 * reasoning the scanner uses: a host written in plain JavaScript must be harmless, and
 * a shape it can read with one `if` is a shape it gets right.
 */
export interface OptionsRequest {
  /**
   * `search` — somebody is typing and wants matching rows.
   * `labels` — the form holds these values already and needs their names.
   */
  kind: 'search' | 'labels'
  /** The name the document gave, which the deployment resolves. */
  source: string
  /** The field's data path, e.g. `canton` or `people[1].canton`. */
  path: string
  /** What was typed. Empty on a `labels` request. */
  query: string
  /** The stored values to name. Empty on a `search`. */
  values: readonly string[]
  /**
   * The locale the form is being resolved in — the engine's, which is the host's own
   * `locale` when it passed one and the document's default otherwise.
   *
   * A remote label is a plain string, never a `{$t}` reference: nothing can check a
   * reference that arrives at runtime, and an unchecked one resolves to nothing and
   * shows an opaque identifier. So the source answers in the right language instead.
   */
  locale: string
  /**
   * How many rows the control can show. A hint: the control caps what arrives anyway.
   *
   * A source that pages reads `limit + 1` rows to know whether there are more, answers a
   * page of `limit`, and never counts the rest: a count reads every matching row on every
   * keystroke, which is the scan paging exists to avoid.
   */
  limit: number
  /** Aborted when the answer stops being wanted — a newer keystroke, or an unmount. */
  signal: AbortSignal
}

/**
 * Where one named list of options comes from.
 *
 * The third instance of the inversion the uploader and the scanner already are: the
 * document names a list, the deployment says what that name means, and nothing in
 * formancy ever makes a request of its own. A URL in a form document would be a
 * deployment detail in a portable format, unfixable once published, and an SSRF
 * surface on a self-hosted instance.
 */
export interface OptionsSource {
  /**
   * Every matching row, as a list — exactly as before a page could be answered, its true
   * total included — or one page of them: `{ options, more, withheld? }`.
   *
   * `more` says rows match beyond these, and the control says so without a number, since
   * nobody counted one. `withheld` counts rows the source matched and cannot hand over — a
   * value a select could not store — because a source withholds and counts rather than
   * filtering silently. A page with any other key, a `more` that is not a boolean or a
   * `withheld` that is not a whole count is refused whole, and the field says its source
   * failed rather than showing a list that looks complete
   * ([0177](../../../docs/decisions/0177-a-source-may-say-its-list-goes-on.md)).
   */
  resolve(request: OptionsRequest): Promise<RemoteOptionsAnswer>
  /** How long to wait after a keystroke before asking. The control has a default. */
  debounceMs?: number
  /**
   * Below this many characters, do not ask at all. The control says so on screen: a
   * typeahead how many to type, and a plain select — whose query is always empty, so it
   * never asks — that its answers are found by searching.
   */
  minQueryLength?: number
  /** How many rows to show at once. */
  maxRows?: number
}

/**
 * Every source this deployment has, by the name a document would use.
 *
 * A MAP rather than one resolver function, and that is the one deliberate difference
 * from `Scanner`. The control has to know **synchronously** whether a name resolves,
 * because absence here is the *file field's* branch and not the scanner's: a text
 * field with no scanner still collects the answer by typing, but a select whose
 * options come only from a source collects nothing at all, so it must say so instead
 * of rendering an empty chooser. With a single resolver, absence would only be
 * discoverable by calling it and failing.
 */
export type OptionsSources = Readonly<Record<string, OptionsSource>>

const OptionsSourcesContext = createContext<OptionsSources | undefined>(undefined)

export const OptionsSourcesProvider = OptionsSourcesContext.Provider

/**
 * The host's sources, or undefined when there are none.
 *
 * Undefined is a supported state and not a misconfiguration — a form with no sourced
 * field never needs one. What it costs, when a document DOES name a source, is the
 * whole field: it renders a message where the chooser would be, exactly as the file
 * field does without an uploader.
 */
export function useOptionsSources(): OptionsSources | undefined {
  return useContext(OptionsSourcesContext)
}
