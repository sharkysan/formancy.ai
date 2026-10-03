import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { createMemoryStorage, publishForm } from '@formancy/server-core'
import type { ServerDeps } from '@formancy/server-core'
import type { FormSchema } from '@formancy/spec'

/**
 * The table in `SAFETY-ANALYSIS.md` B1a, driven through a real publish.
 *
 * It tells a manufacturer which of three mistakes publishing refuses and which
 * two it merely warns about, and they are meant to build their own assessment on
 * that. A wrong row there is worse than an absent one: an absent row prompts the
 * question, a wrong one answers it incorrectly — and this table's rows are
 * exactly the kind that rot, because they depend on how strictly the *engine*
 * happens to declare its variables.
 *
 * I know they rot because the paragraph this replaced was wrong. It said a
 * document with a rule reading a path no field has "can be published and nothing
 * refuses it", flatly. Measured, an unknown **root** is refused — the engine
 * compiles each rule against the fields that exist — and only the deeper cases
 * get through. Written from reasoning rather than from a run, and wrong in the
 * direction that under-claims the software's own safety.
 *
 * So the rows are parsed out of the document and each one published. The verdict
 * column is read, not matched against a phrase, because a guard that greps for
 * "refused" passes on a paragraph that happens to contain the word.
 */
const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..', '..')

/** A form with a group, so a rule can read into one. */
const grouped = (cel: string, target: string): FormSchema =>
  ({
    specVersion: '2',
    id: 'warned',
    title: 'Warned',
    model: {
      fields: [
        { key: 'note', type: 'text', label: 'Note' },
        {
          key: 'address',
          type: 'group',
          label: 'Address',
          fields: [{ key: 'city', type: 'text', label: 'City' }],
        },
        {
          key: 'items',
          type: 'repeater',
          label: 'Items',
          fields: [
            { key: 'qty', type: 'number', label: 'Quantity' },
            { key: 'total', type: 'number', label: 'Total' },
          ],
        },
      ],
    },
    logic: {
      rules: [{ target, kind: target.includes('[]') ? 'computed' : 'visible', cel }],
    },
  }) as unknown as FormSchema

const deps = (): ServerDeps => {
  let counter = 0
  return {
    storage: createMemoryStorage(),
    newId: () => `id-${String(++counter)}`,
    draftSecret: 'a-test-signing-key-of-adequate-length',
    capabilities: { now: () => 1, today: () => '2026-10-04', random: () => 0.5 },
    nowIso: () => '2026-10-04T00:00:00Z',
  }
}

/** What publishing does with that rule: refuses it, or publishes and warns. */
async function verdictOf(cel: string, target: string): Promise<'refused' | 'warned' | 'silent'> {
  const outcome = await publishForm(deps(), { path: 'subject', schema: grouped(cel, target) })
  if (!outcome.ok) return 'refused'
  return outcome.warnings.length > 0 ? 'warned' : 'silent'
}

/**
 * Where this table is told, which is twice.
 *
 * The regulatory entry tells a manufacturer and the concepts page tells a
 * developer, in their own words — and two copies of one fact is two things to
 * keep true. Guarding only the one that happened to be written first is how the
 * other rots, so both are parsed and both are driven.
 */
const TABLES = [
  {
    name: 'SAFETY-ANALYSIS.md B1a',
    file: ['docs', 'regulatory', 'SAFETY-ANALYSIS.md'],
    heading: '### B1a.',
  },
  {
    name: 'concepts/logic.md',
    file: ['apps', 'docs', 'src', 'content', 'docs', 'concepts', 'logic.md'],
    heading: '## A rule that reads a field you removed',
  },
] as const

/** The rows of one table, as expressions and the verdict that document claims. */
function rows(table: (typeof TABLES)[number]): Array<{ cel: string; claims: string }> {
  const text = readFileSync(join(repo, ...table.file), 'utf8')
  const from = text.indexOf(table.heading)
  expect(from, `${table.name} has no "${table.heading}" section`).toBeGreaterThan(-1)
  // The next heading at the same level or above, so the slice stops at the end
  // of this entry rather than at the end of the document.
  const rest = text.slice(from + table.heading.length)
  const next = /\n#{2,3} /.exec(rest)
  const section = next === null ? rest : rest.slice(0, next.index)

  const parsed: Array<{ cel: string; claims: string }> = []
  for (const line of section.split('\n')) {
    const cells = line.split('|').map((cell) => cell.trim())
    if (cells.length !== 4) continue
    const [, what, verdict] = cells as [string, string, string]
    // The expression is the backticked part of the first cell.
    const cel = /`([^`]+)`/.exec(what)?.[1]
    if (cel === undefined || verdict === '' || /^-+$/.test(verdict)) continue
    parsed.push({ cel, claims: verdict })
  }
  return parsed
}

describe.each(TABLES)('what $name claims publishing does about an unknown path', (table) => {
  test('is a table with every row the document shows', () => {
    // A guard on the guard: a parse that found nothing would make the assertion
    // below vacuous, and three is what the prose argues with — one refusal and
    // the two cases CEL cannot see.
    expect(rows(table).map(({ cel }) => cel)).toEqual([
      'gone == "8000"',
      'address.nope',
      'item.nope',
    ])
  })

  test('and every row is what a real publish actually does', async () => {
    /*
     * The expressions in the table are written as a reader would meet them, so
     * two of the three are fragments rather than whole conditions — `address.nope`
     * needs comparing to something before it is a `visible` rule. Completed here
     * rather than written out in the document, because the document is explaining
     * which PATH is unknown and a comparison would be noise in that sentence.
     */
    const asRule: Record<string, { cel: string; target: string }> = {
      'gone == "8000"': { cel: 'gone == "8000"', target: 'note' },
      'address.nope': { cel: 'address.nope == "Zug"', target: 'note' },
      'item.nope': { cel: 'item.nope * 2.0', target: 'items[].total' },
    }

    const wrong: string[] = []
    for (const { cel, claims } of rows(table)) {
      const subject = asRule[cel]
      expect(subject, `${table.name} grew a row this guard cannot drive: ${cel}`).toBeDefined()
      if (subject === undefined) continue

      // Read off the verdict cell rather than matched as a phrase: "refused"
      // appears in the surrounding prose too, and a grep would pass on it.
      const expected = claims.includes('refused') ? 'refused' : 'warned'
      const actual = await verdictOf(subject.cel, subject.target)
      if (actual !== expected) {
        wrong.push(`${table.name}: ${cel} is called ${expected}, publishing ${actual}`)
      }
    }

    expect(wrong).toEqual([])
  })

  test('and a rule reading only what exists is neither refused nor warned', async () => {
    // The row the table does not need and the guard does: a channel that warns
    // about a correct document is a channel a manufacturer learns to ignore, and
    // then the two rows above are worth nothing.
    expect(await verdictOf('address.city == "Zug"', 'note')).toBe('silent')
    expect(await verdictOf('item.qty * 2.0', 'items[].total')).toBe('silent')
  })
})
