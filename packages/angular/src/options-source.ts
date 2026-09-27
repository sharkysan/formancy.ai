import { InjectionToken, inject } from '@angular/core'
import type { RemoteOption } from '@formancy/spec'

/**
 * What a source is asked for.
 *
 * Declared here as well as in `@formancy/react` and deliberately not shared, exactly
 * as `ScanRequest` and `Scanner` are declared twice. A host contract each binding
 * states in its own words is a contract each binding can be read on its own.
 *
 * `kind` is a flat discriminator rather than a union of two interfaces: a host
 * written in plain JavaScript must be harmless, and a shape it can read with one
 * `if` is a shape it gets right.
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
  /** How many rows the control can show. A hint: the control caps what arrives anyway. */
  limit: number
  /** Aborted when the answer stops being wanted — a newer keystroke, or a destroy. */
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
  resolve(request: OptionsRequest): Promise<readonly RemoteOption[]>
  /** How long to wait after a keystroke before asking. The control has a default. */
  debounceMs?: number
  /** Below this many characters, do not ask at all. The control says so on screen. */
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
 * of rendering an empty chooser.
 */
export type OptionsSources = Readonly<Record<string, OptionsSource>>

/**
 * Optional, and what its absence costs depends on the document. A form with no
 * sourced field never needs one; a field that names a source renders a message where
 * its chooser would be, exactly as the file field does without an uploader.
 */
export const FORMANCY_OPTIONS_SOURCES = new InjectionToken<OptionsSources>(
  'formancy.optionsSources',
)

export function injectOptionsSources(): OptionsSources | null {
  return inject(FORMANCY_OPTIONS_SOURCES, { optional: true })
}

/** Providing them, for a host that has the lists a document names. */
export function provideFormancyOptionsSources(sources: OptionsSources) {
  return { provide: FORMANCY_OPTIONS_SOURCES, useValue: sources }
}
