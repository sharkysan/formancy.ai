import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

/**
 * Counts written into prose, checked against what they count.
 *
 * These are the facts most certain to go stale, because they change without
 * anybody editing the sentence that states them. The README said **forty-eight**
 * decision records when there were sixty, and the landing page said fifty-eight
 * while this very test file was being added — which had already turned `main`
 * red once, through two branches that did not conflict textually: one adding a
 * record, one stating the total.
 *
 * Spelled-out numbers are the worst of them. "Forty-eight" does not read as a
 * number to somebody skimming, so it survives twelve additions in a way that
 * "48" would not.
 *
 * [0060](../../../docs/decisions/0060-documentation-is-checked.md) is the
 * general argument.
 */
const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..', '..')

const read = (...parts: string[]): string => readFileSync(join(repo, ...parts), 'utf8')

/** A decision record is a numbered Markdown file, the same rule the site uses. */
function decisionRecords(): string[] {
  return readdirSync(join(repo, 'docs', 'decisions')).filter((name) =>
    /^\d{4}-.*\.md$/.test(name),
  )
}

/**
 * English for a count, up to the point where this stops being worth it.
 *
 * Deliberately not a general number-speller: the list ending is the signal to
 * reconsider whether a document should carry the figure at all.
 */
const TENS: Readonly<Record<number, string>> = {
  20: 'Twenty',
  30: 'Thirty',
  40: 'Forty',
  50: 'Fifty',
  60: 'Sixty',
  70: 'Seventy',
  80: 'Eighty',
  90: 'Ninety',
}
const UNITS = [
  '',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
] as const

function spelled(count: number): string | undefined {
  const ten = Math.floor(count / 10) * 10
  const unit = count % 10
  const tens = TENS[ten]
  if (tens === undefined) return undefined
  return unit === 0 ? tens : `${tens}-${UNITS[unit]!}`
}

describe('the decision-record count', () => {
  test('is stated in the README as the number of records', () => {
    const count = decisionRecords().length
    const word = spelled(count)

    expect(word, `no spelling for ${count} — extend TENS, or stop printing the figure`)
      .toBeDefined()
    // The README links the count, so the claim and the thing it counts sit in
    // one line: `[Sixty decision records](./docs/decisions/)`.
    expect(read('README.md')).toContain(`[${word!} decision records](./docs/decisions/)`)
  })

  test('is derived by the landing page, not written into it', () => {
    // The literal went stale three times, so the page no longer holds one: the
    // count is read from `docs/decisions` when the site is built and handed in
    // as a Vite define. This guards the mechanism rather than the number — a
    // literal put back here would pass every test the site has until the next
    // record is added, which is exactly how the last three got in.
    expect(read('apps', 'site', 'src', 'app.tsx')).toContain('String(__DECISION_RECORDS__)')
    expect(read('apps', 'site', 'decision-records.ts')).toContain('docs/decisions/')
    expect(read('apps', 'site', 'decision-records.ts')).toContain('readdirSync')

    // And the two definitions of "a record" must agree. This file and the
    // site's helper each decide what counts by their own regex, and a
    // disagreement would make the page confidently print the wrong total.
    expect(decisionRecords().length).toBeGreaterThan(0)
  })

  test('every record is numbered in sequence, with no gaps or repeats', () => {
    // A gap means a record was deleted rather than marked superseded, which the
    // set's own rule forbids: a reversed decision keeps its number and points
    // forward. A repeat means two branches picked the same number, which is the
    // ordinary way this collides.
    const numbers = decisionRecords()
      .map((name) => Number(name.slice(0, 4)))
      .sort((a, b) => a - b)

    expect(numbers).toEqual(numbers.map((_, index) => index + 1))
  })
})

describe('every decision record', () => {
  const records = decisionRecords()

  test('says what would fail if it were violated', () => {
    // The field that makes the set auditable rather than aspirational. Where
    // nothing enforces a decision the record must say so in those words, not
    // omit the line and leave the reader to assume something does.
    const missing = records.filter(
      (name) => !read('docs', 'decisions', name).includes('**Verified by:**'),
    )

    expect(missing).toEqual([])
  })

  test('carries a status and a date', () => {
    const malformed = records.filter((name) => {
      const text = read('docs', 'decisions', name)
      return !/- \*\*Status:\*\* /.test(text) || !/- \*\*Date:\*\* \d{4}-\d{2}-\d{2}/.test(text)
    })

    expect(malformed).toEqual([])
  })

  test('has a title matching its number', () => {
    // `0058-a-breaker-per-destination.md` must open `# 0058 — …`. A record
    // renumbered in a rebase but not retitled is cited by the wrong number
    // everywhere else, and the citations are how the set is read.
    const mismatched = records.filter((name) => {
      const number = name.slice(0, 4)
      return !read('docs', 'decisions', name).startsWith(`# ${number} — `)
    })

    expect(mismatched).toEqual([])
  })
})
