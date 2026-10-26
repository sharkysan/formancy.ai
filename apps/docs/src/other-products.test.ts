import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

/**
 * The documentation and the site name no other form product
 * ([0188](../../../docs/decisions/0188-the-documentation-names-no-other-product.md)).
 *
 * A sentence about another vendor — what it charges for, what its builder leads with — is
 * true on a day, and nothing in this repository can keep it true. [0141] removed the one
 * comparison on the site for that reason; the roadmap and the architecture introduction
 * still benchmarked against two products by name, and nothing stopped a third.
 *
 * The names are data, and the list is the products the documents once named. Each is
 * matched as the product's own spelling, case-insensitively, so `form.io`, `Form.io` and
 * `formio` are one entry.
 *
 * **The changelog and decision records are excluded on purpose.** They record what was
 * argued at the time, and rewriting them would falsify the record.
 */
const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..', '..')

/**
 * `FormEngine` is also this repository's own engine type, so it is the one entry whose two
 * patterns differ. In prose it is a word outside backticks, which reaches the product's link
 * too. In the site's source the type is an identifier, so there only the domain counts — and it
 * is found as the lowercase word the domain is spelled with, which the type never is, rather
 * than as the domain itself. CodeQL reads a pattern or a substring test ending in a domain as a
 * URL check that lets any host through (js/regex/missing-regexp-anchor, then
 * js/incomplete-url-substring-sanitization), and here matching anywhere is the point.
 */
type Product = { name: string; prose: RegExp; source: RegExp }

const products: readonly Product[] = [
  { name: 'form.io', prose: /\bform\.?io\b/i, source: /\bform\.?io\b/i },
  { name: 'FormEngine', prose: /(?<![`\w])FormEngine(?![`\w])/i, source: /\bformengine\b/ },
  { name: 'SurveyJS', prose: /\bsurvey\.?js\b/i, source: /\bsurvey\.?js\b/i },
]

/** Prose with inline code and fenced blocks removed, so an identifier is not a name. */
const withoutCode = (text: string): string => text.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '')

function files(directory: string, keep: (name: string) => boolean): string[] {
  if (!existsSync(directory)) return []
  const out: string[] = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'decisions') continue
      out.push(...files(full, keep))
    } else if (keep(entry.name)) out.push(full)
  }
  return out
}

const markdown = (name: string): boolean => (name.endsWith('.md') || name.endsWith('.mdx')) && name !== 'CHANGELOG.md'
const pages = (name: string): boolean => name.endsWith('.html') || /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)

/** Every page a reader is expected to read as formancy describing itself. */
const prose = [
  join(repo, 'README.md'),
  ...files(join(repo, 'docs'), markdown),
  ...files(join(repo, 'apps', 'docs', 'src', 'content'), markdown),
  ...files(join(repo, 'packages'), (name) => name === 'README.md'),
  ...files(join(repo, 'templates'), (name) => name === 'README.md'),
]

/** The landing page and its siblings, whose text is in markup and components. */
const site = files(join(repo, 'apps', 'site'), pages)

const named = (paths: string[], pattern: (product: Product) => RegExp, strip: (text: string) => string) =>
  paths.flatMap((path) => {
    const text = strip(readFileSync(path, 'utf8'))
    return products.filter((product) => pattern(product).test(text)).map((product) => `${path.slice(repo.length + 1)}: ${product.name}`)
  })

describe('the documentation names no other product', () => {
  // Guards against the walk finding nothing — a moved directory would pass every case below.
  test('the walk reaches the roadmap, the architecture and the landing page', () => {
    const relative = [...prose, ...site].map((path) => path.slice(repo.length + 1))
    expect(relative).toContain(join('apps', 'docs', 'src', 'content', 'docs', 'project', 'roadmap.md'))
    expect(relative).toContain(join('docs', 'architecture', '01-introduction-and-goals.md'))
    expect(relative).toContain(join('apps', 'site', 'index.html'))
  })

  // A roadmap that benchmarks against a vendor by name makes a claim about that vendor's
  // pricing and features that goes stale the day they change either.
  test('no document names one', () => {
    expect(named(prose, (product) => product.prose, withoutCode)).toEqual([])
  })

  // The landing page is the comparison 0141 removed; this keeps it from coming back by
  // another component.
  test('no page of the site names one', () => {
    expect(named(site, (product) => product.source, (text) => text)).toEqual([])
  })

  // The FormEngine exception must not hide the type it exists for: the engine's own name in
  // code still documents, and the rule must not push anybody to rename it.
  test('the engine type in backticks is not mistaken for the product', () => {
    const formEngine = products.find((product) => product.name === 'FormEngine')!
    expect(formEngine.prose.test(withoutCode('`FormEngine` comes from `@formancy/core`'))).toBe(false)
    expect(formEngine.prose.test(withoutCode('what FormEngine leads with'))).toBe(true)
  })

  // The product's link is the word too, so the prose test needs no domain of its own — and in
  // the site's source the type is everywhere, so there the domain is all that counts.
  test('the domain is found in prose and source, and the type in source is not', () => {
    const formEngine = products.find((product) => product.name === 'FormEngine')!
    expect(formEngine.prose.test('[the closest thing](https://formengine.io)')).toBe(true)
    expect(formEngine.source.test("<a href='https://formengine.io'>")).toBe(true)
    expect(formEngine.source.test("import type { FormEngine } from '@formancy/core'")).toBe(false)
  })
})
