import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

/**
 * The decision records, and the counts of them written into prose.
 *
 * This is the fact most certain to go stale, because it changes without anybody
 * editing the sentence that states it — and the branch that adds a record is
 * never the branch that prints the total. It went wrong three times: the README
 * said "Forty-eight" when there were sixty, and the landing page's literal
 * turned `main` red twice through a semantic merge conflict, two branches that
 * did not conflict textually.
 *
 * Spelled-out numbers are the worst of them, because "Forty-eight" does not
 * read as a number to somebody skimming, so it survives twelve additions in a
 * way that "48" would not.
 *
 * So neither document carries a number any more. The page derives one at build
 * time and the README does without. What is guarded here is that arrangement,
 * because putting a literal back would pass every other test in the repository
 * until the next record was added — which is precisely how the last three got
 * in ([0060](../../../docs/decisions/0060-documentation-is-checked.md)).
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

describe('the decision-record count', () => {
  test('is not written into the README at all', () => {
    const readme = read('README.md')

    // The convention is to prefer wording without a number where a number is
    // not the point, because a static Markdown file has no build step to derive
    // one in. "The decision records" cannot go stale.
    expect(readme).toContain('[The decision records](./docs/decisions/)')

    // And nothing reintroduces one. Whatever word sits before the phrase is
    // read out and checked against what is allowed, rather than guessed at with
    // a pattern for "looks like a number" — the first attempt at that flagged
    // "The". Both `60 decision records` and `Sixty decision records` are caught,
    // and the second is the one that actually happened.
    //
    // The capture is letters, digits and hyphens only, so the `[` of a Markdown
    // link never lands in it. An earlier version captured non-whitespace and
    // stripped the bracket afterwards, which CodeQL correctly flagged: a
    // single-argument `replace` removes only the first one, so the guard would
    // have misread `[[The` as a count.
    const ALLOWED = ['The', 'the']
    const words = [...readme.matchAll(/([A-Za-z0-9-]+) decision records/g)].map(
      (match) => match[1]!,
    )

    expect(
      words.filter((word) => !ALLOWED.includes(word)),
      'the README states a record count again — prefer wording without a number',
    ).toEqual([])
  })

  test('is derived by the landing page, not written into it', () => {
    // Read from `docs/decisions` when the site is built and handed to the page
    // as a Vite define, so a new record is on the page the moment it merges.
    expect(read('apps', 'site', 'src', 'app.tsx')).toContain('String(__DECISION_RECORDS__)')
    expect(read('apps', 'site', 'decision-records.ts')).toContain('docs/decisions/')
    expect(read('apps', 'site', 'decision-records.ts')).toContain('readdirSync')
  })

  test('is what the site asserts, against a differently-resolved list', () => {
    // The site's own case counts records through a bundler glob while the build
    // counts them through `readdirSync`. Two definitions of "a record", which
    // is what keeps that test from being a tautology — so it has to stay a
    // glob, not be quietly changed to read the define.
    expect(read('apps', 'site', 'src', 'site.test.tsx')).toContain(
      "import.meta.glob('../../../docs/decisions/[0-9][0-9][0-9][0-9]-*.md')",
    )
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

  test('is listed in the index that says what the set is', () => {
    // `docs/decisions/README.md` is how the set is entered. A record that is
    // not in it exists only for somebody who already knows the number.
    const index = read('docs', 'decisions', 'README.md')

    const unlisted = records.filter((name) => !index.includes(name))

    expect(unlisted).toEqual([])
  })
})
