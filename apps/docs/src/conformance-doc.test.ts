import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

/**
 * The conformance page's table of shipped fixtures, held to the fixtures directory.
 *
 * It said "Six cases" and listed six while eleven shipped: every fixture added since was
 * missing from the one page a renderer author reads to learn what they will be held to.
 * The rows are the fixture files' names with their dashes spaced, so a fixture added
 * without a row, or a row left after its fixture went, fails here.
 */
const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..', '..')

const fixtures = readdirSync(join(repo, 'packages', 'conformance', 'fixtures'))
  .filter((file) => file.endsWith('.json'))
  .map((file) => file.replace(/\.json$/, '').replaceAll('-', ' '))
  .sort()

const page = readFileSync(join(here, 'content', 'docs', 'concepts', 'conformance.md'), 'utf8')

/** The first cell of every row of the table under "What the shipped fixtures cover". */
function rows(): string[] {
  const section = page.split('## What the shipped fixtures cover')[1]?.split('\n## ')[0] ?? ''
  return section
    .split('\n')
    .filter(
      (line) => line.startsWith('| ') && !line.startsWith('| Fixture') && !line.startsWith('| ---'),
    )
    .map((line) => line.split('|')[1]?.trim() ?? '')
    .sort()
}

describe('the conformance page', () => {
  test('lists every shipped fixture, and nothing else', () => {
    expect(fixtures.length).toBeGreaterThan(0)
    expect(rows()).toEqual(fixtures)
  })

  test('and does not count them in prose, which is how it went stale', () => {
    const section = page.split('## What the shipped fixtures cover')[1]?.split('\n## ')[0] ?? ''
    expect(section).not.toMatch(
      /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d+) cases\b/i,
    )
  })
})
