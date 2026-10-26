import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { ANSWER_KINDS, FIELD_TYPES } from '@formancy/spec'
import type { FieldType } from '@formancy/spec'

/**
 * The answer table in the schema page says what `ANSWER_KINDS` says (0189).
 *
 * The table was the only statement of each type's answer before the format had one in
 * code, and it is still the one a reader of the documentation sees. So it is compared
 * with the data the engine enforces, row by row: which types it lists, and what each
 * says an unanswered field holds. Prose around it is free; the facts in it are not.
 */
const here = dirname(fileURLToPath(import.meta.url))
const page = readFileSync(join(here, 'content', 'docs', 'concepts', 'schema.md'), 'utf8')

/** The table's rows: the types in the first column, and the last column's text. */
function rows(): Array<{ types: FieldType[]; unanswered: string }> {
  const start = page.indexOf('## The answer shape each type stores')
  const end = page.indexOf('\n## ', start + 1)
  return page
    .slice(start, end)
    .split('\n')
    .filter((line) => line.startsWith('| `'))
    .map((line) => {
      const cells = line.split(' | ')
      const types = [...cells[0]!.matchAll(/`([a-z]+)`/g)].map((match) => match[1] as FieldType)
      return { types, unanswered: cells[cells.length - 1]!.replace(/ \|$/, '') }
    })
}

/** The types that store an answer: everything but the ones that hold or collect none. */
const answering = FIELD_TYPES.filter((type) => !['nothing', 'group', 'page', 'rows'].includes(ANSWER_KINDS[type].shape))

describe('the answer table and the format agree', () => {
  // A type added to the format and not to the page is a type whose answer a reader of the
  // documentation cannot find; one listed twice can be described two ways.
  test('it lists every answering type, once', () => {
    const listed = rows().flatMap((row) => row.types)
    expect([...listed].sort()).toEqual([...answering].sort())
  })

  // The column a consumer reads to know what "no answer" looks like: saying `null` for a
  // list would have them test for a value the engine refuses, and the reverse would leave
  // them unprepared for one it accepts.
  test.each(answering)('%s: the unanswered column says what the table enforces', (type) => {
    const row = rows().find((candidate) => candidate.types.includes(type))!
    const kind = ANSWER_KINDS[type]
    expect(row.unanswered.includes('`null`')).toBe(kind.nullable)
    expect(row.unanswered.includes("`''`")).toBe(kind.shape === 'text')
  })
})
