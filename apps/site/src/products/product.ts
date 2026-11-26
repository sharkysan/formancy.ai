import type { ReactElement, ReactNode } from 'react'
import type { Page } from '../chrome.js'

/**
 * What a paid module's product page says (0242), one file per module beside this one, and
 * one layout, `product-page.tsx`, that draws each of them in the site's shell.
 *
 * Nothing in this repository can read those modules' repositories, so nothing here checks
 * what the pages say about them: it was read from each on `READ_ON`, and the pages say so.
 * What is held here is the shape — every module link beside its terms, HL7's sentence on a
 * page that names HL7, the head each page's `index.html` carries — in `product-page.test.tsx`.
 *
 * What a module does not do yet is not among what a page says: the module's own pages say it,
 * and the page links them (0245).
 */

/** The day the modules' pages, and the landing page's section, were read from each module's repository. */
export const READ_ON = '2026-11-25'

/** HL7's own sentence, as Formancy Health's NOTICE quotes it, owed by every page that names HL7 or FHIR. */
export const HL7_MARK =
  'HL7, FHIR and the FHIR [FLAME DESIGN] are the registered trademarks of Health Level Seven International and their use does not constitute endorsement by HL7.'

/** The terms, as every module link on the site carries them beside it (0179, 0241). */
export const TERMS = 'Not free · paid in production'

export interface Link {
  readonly label: string
  readonly href: string
}

export interface Product {
  readonly page: Extract<Page, 'data' | 'report' | 'health'>
  readonly name: string
  readonly repository: string
  /** The `<title>` and description its `index.html` carries, which the page's test holds the file to. */
  readonly title: string
  readonly description: string
  readonly h1: ReactNode
  readonly lede: string
  /** The first two are drawn as buttons, the demo first; the rest as links beside them. */
  readonly ctas: readonly Link[]
  readonly example: { readonly figure: ReactElement; readonly real: Link }
  /** What it does: each the benefit first, then at most a short sentence on how; the module's own pages say the rest. */
  readonly capabilities: ReadonlyArray<{ readonly label: string; readonly detail: string }>
  /** Where the module's own pages say more, each linked by its topic. */
  readonly further: { readonly lede: string; readonly links: readonly Link[] }
  /** Nodes rather than strings, so a word in another language can carry its `lang` (WCAG 3.1.2). */
  readonly jobs: readonly ReactNode[]
  readonly whoFor: ReactNode
  readonly fits: readonly ReactNode[]
  /** Another paid module this one works with, linked in a group named by that module's terms, not this one's. */
  readonly related?: { readonly name: string; readonly link: Link }
  readonly release: { readonly version: string; readonly date: string; readonly preview: boolean; readonly said: string }
  readonly licence: {
    readonly line: string
    readonly rows: ReadonlyArray<readonly [use: string, terms: string]>
    readonly howToBuy: string
  }
  /** HL7's sentence, on the one page that names its marks. */
  readonly mark?: string
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/**
 * `2026-11-22` as "22 November 2026", the same in the build and in the browser, whatever either's
 * locale. Here rather than in `product-page.tsx`, so the landing page's section can date itself
 * without importing the product page's stylesheet.
 */
export function longDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number)
  const name = MONTHS[(month ?? 0) - 1]
  if (year === undefined || name === undefined || day === undefined || Number.isNaN(day)) throw new Error(`Not a date written YYYY-MM-DD: ${iso}`)
  return `${String(day)} ${name} ${String(year)}`
}

/** Where a production licence is asked for, with the module named in the subject so the question arrives already sorted. */
export const askAbout = (name: string): string => `mailto:info@formancy.ai?subject=${encodeURIComponent(`${name} production licence`)}`

/** A module's repository on GitHub, and a file in it. */
export const github = (repository: string, path = ''): string => `https://github.com/sharkysan/${repository}${path === '' ? '' : `/blob/main/${path}`}`
