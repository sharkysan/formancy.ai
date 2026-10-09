import type { FixtureProblem } from './validate.js'
import { asRecord, describeValue } from './values.js'

/**
 * The text a driver has to find a control by, and the catalogues it resolves
 * through.
 *
 * Split out of `validate.ts` when the budget refused the locale check added
 * there; that check has since moved to `mount.ts`, beside the layout a fixture
 * mounts with. It is one reason to change: everything here is about a fixture being
 * *findable* — by accessible name, in the language it is mounted in
 * ([0107](../../../docs/decisions/0107-layout-text-is-read-in-the-engines-locale.md)).
 *
 * `FixtureProblem` comes back from `validate.ts` as a type only, so the cycle
 * is erased at compile time and there is no import at runtime.
 */

/**
 * What is wrong with a piece of text that has to become an accessible name, or
 * undefined when it will. Accepts either a literal or a `{ $t }` reference,
 * because the renderers accept both — and insists the reference resolves,
 * because a driver searching for an unresolved id finds nothing.
 */
export function accessibleNameProblem(
  label: unknown,
  messages: ReadonlySet<string> | undefined,
): string | undefined {
  if (typeof label === 'string') {
    return label === '' ? 'needs a non-empty label' : undefined
  }
  const record = asRecord(label)
  const ref = record?.['$t']
  if (typeof ref !== 'string') return 'needs a non-empty label'
  if (messages === undefined) {
    return `refers to "${ref}", but the fixture has no i18n section`
  }
  if (!messages.has(ref)) {
    return `refers to "${ref}", which the default locale does not define`
  }
  return undefined
}

/** The message ids the default locale defines, or undefined when unlocalised. */
export function messageCatalogue(value: unknown): ReadonlySet<string> | undefined {
  const i18n = asRecord(value)
  if (i18n === undefined) return undefined
  const locale = i18n['defaultLocale']
  if (typeof locale !== 'string') return new Set()
  const catalogue = asRecord(asRecord(i18n['messages'])?.[locale])
  if (catalogue === undefined) return new Set()
  return new Set(Object.keys(catalogue).filter((id) => typeof catalogue[id] === 'string'))
}

export function validateI18n(value: unknown, at: string): FixtureProblem[] {
  if (value === undefined) return []
  const i18n = asRecord(value)
  if (i18n === undefined) {
    return [{ path: at, message: `expected an object, got ${describeValue(value)}` }]
  }

  const problems: FixtureProblem[] = []
  const locale = i18n['defaultLocale']
  if (typeof locale !== 'string' || locale === '') {
    problems.push({ path: `${at}.defaultLocale`, message: 'expected a non-empty string' })
  }

  const messages = asRecord(i18n['messages'])
  if (messages === undefined) {
    problems.push({
      path: `${at}.messages`,
      message: `expected an object, got ${describeValue(i18n['messages'])}`,
    })
    return problems
  }

  if (typeof locale === 'string' && asRecord(messages[locale]) === undefined) {
    problems.push({
      path: `${at}.messages.${locale}`,
      message: 'the default locale needs a catalogue: it is what every other locale falls back to',
    })
  }

  for (const [name, catalogue] of Object.entries(messages)) {
    const entries = asRecord(catalogue)
    if (entries === undefined) {
      problems.push({ path: `${at}.messages.${name}`, message: 'expected an object' })
      continue
    }
    for (const [id, text] of Object.entries(entries)) {
      if (typeof text !== 'string' || text === '') {
        problems.push({
          path: `${at}.messages.${name}.${id}`,
          message: 'expected a non-empty string',
        })
      }
    }
  }

  return problems
}
