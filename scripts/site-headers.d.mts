/**
 * Types for `site-headers.mjs`, which is plain JavaScript because nothing builds
 * `scripts/` and `build-web.mjs` imports it from a bare checkout.
 *
 * Hand-written, like `codecov-config.d.mts`. What it cannot drift on is behaviour:
 * `apps/docs/src/site-headers.test.ts` calls the functions, and the browser gate
 * serves the composed site under what they return.
 */

/** Where formancy.ai is served, which the deploy's `_headers` is written for. */
export const SITE_ORIGIN: string

/** Cloudflare's limit on the rules of one `_headers` file. */
export const RULE_LIMIT: number

/** Cloudflare's limit on the characters of one line of `_headers`. */
export const LINE_LIMIT: number

/** A section's inline scripts and styles, each as a `sha256-…` source. */
export interface Inline {
  scripts: readonly string[]
  styles: readonly string[]
}

/** A section of the site, served under a policy of its own. */
export interface Section {
  name: 'site' | 'starter' | 'playground' | 'docs'
  /** As `_headers` matches them: exactly, or with a splat at the end. */
  paths: readonly string[]
  policy: (origin: string, inline: Inline) => string[]
}

export const SECTIONS: readonly Section[]

/** One rule of `_headers`: a path and the headers a response for it carries, name to value. */
export interface Rule {
  readonly path: string
  readonly headers: Readonly<Record<string, string>>
}

/** The rules for the site at `origin`, `/*` first; `report` adds the address every refusal is posted to. */
export function headersFor(origin: string, inline: Readonly<Record<Section['name'], Inline>>, options?: { report?: string }): readonly Rule[]

/** Whether a `_headers` path matches a request's path. */
export function matches(path: string, pathname: string): boolean

/** The headers a response for `pathname` carries, as Cloudflare applies `rules`. */
export function headersAt(rules: readonly Rule[], pathname: string): Record<string, string>

/** `_headers` as written to disk, trailing newline included. */
export function headersFile(rules: readonly Rule[]): string

/** Each section's inline scripts and styles, read from the composed site at `site`. */
export function inlineOf(site: string): Record<Section['name'], Inline>
