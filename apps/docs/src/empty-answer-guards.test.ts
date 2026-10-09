import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { createFormEngine } from '@formancy/core'
import { compile, evaluate, fixedCapabilities } from '@formancy/expressions'
import type { FormSchema } from '@formancy/spec'

/**
 * The table in `concepts/logic.md` that says which conditions error on an empty
 * form, checked against a real engine rather than proofread.
 *
 * It is the most load-bearing paragraph on that page and the easiest to get
 * wrong, because a `visible` rule that errors fails **open** — the field it was
 * meant to hide is simply always there, which looks like a rule nobody wrote
 * rather than a rule that is broken. Two of the three failing shapes in that
 * table are ones a careful author would reach for on purpose:
 * `address.country != null` reads as a null guard and is not one.
 *
 * Both were found in this project's own playground demo, by running it. So the
 * table is parsed out of the page and every row evaluated here: a row that stops
 * being true fails, and a row added to the prose without a verdict fails too.
 *
 * Why in `apps/docs`: this is a documentation guard, and they live together. It
 * is the reason this app has the engine as a devDependency at all.
 */
const here = dirname(fileURLToPath(import.meta.url))
const page = join(here, 'content', 'docs', 'concepts', 'logic.md')

/** A form with a top-level checkbox and a group, which is what the rows read. */
const documentFor = (cel: string): FormSchema =>
  ({
    specVersion: '3',
    id: 'guards',
    title: 'Guards',
    model: {
      fields: [
        { key: 'needsVisa', type: 'checkbox', label: 'Needs visa' },
        {
          key: 'address',
          type: 'group',
          label: 'Address',
          fields: [
            {
              key: 'country',
              type: 'select',
              label: 'Country',
              options: [{ value: 'CH', label: 'Switzerland' }],
            },
          ],
        },
        { key: 'age', type: 'number', label: 'Age' },
        { key: 'notice', type: 'static', label: 'Notice' },
      ],
    },
    logic: { rules: [{ target: 'notice', kind: 'visible', cel }] },
  }) as unknown as FormSchema

/**
 * What the condition does on an untouched form: `true`, `false`, or `errors`.
 *
 * Asked of CEL rather than of the engine, and that is forced rather than
 * chosen. The engine fails a metadata rule **open** and reports nothing — there
 * is no `ruleErrors` on a snapshot — so through the engine an erroring
 * condition and a condition that is genuinely `true` are indistinguishable.
 * That indistinguishability is the hazard
 * ([A5](../../../docs/regulatory/SAFETY-ANALYSIS.md)), so it cannot also be the
 * oracle. The table is a claim about the expression, and this asks the
 * expression.
 */
function verdictOf(cel: string): 'true' | 'false' | 'errors' {
  const compiled = compile(cel, { kind: 'visible', variables: DECLARATIONS })
  if (!compiled.ok) return 'errors'
  const outcome = evaluate(compiled.program, EMPTY_ANSWERS, {
    capabilities: fixedCapabilities({ nowMs: 0, today: '2026-10-02', random: 0.5 }),
  })
  if (!outcome.ok) return 'errors'
  return outcome.value === true ? 'true' : 'false'
}

/**
 * An untouched form, as the engine presents one to a rule.
 *
 * A checkbox nobody has ticked is `null`, not `false`, and a group nobody has
 * opened is `null`, not `{}`. Both are the whole point of the table: it is the
 * nullness that makes the obvious condition error.
 */
const EMPTY_ANSWERS: Record<string, unknown> = { needsVisa: null, address: null, age: null }

/**
 * Every leaf `dyn`, which is how the engine declares them.
 *
 * Not a convenience: `dyn` is the declaration that lets an unfinished answer
 * compile at all, and it is therefore the declaration under which these
 * conditions are checked in a real form. Declaring `needsVisa` as `bool` here
 * would make `!needsVisa` type-check and evaluate, and the table would be
 * testing a form nobody can build.
 */
const DECLARATIONS = { needsVisa: 'dyn', address: 'dyn', age: 'dyn' } as const

/** The rows of the one table under the empty-answer heading. */
function rows(): Array<{ cel: string; claim: string }> {
  const text = readFileSync(page, 'utf8')
  const from = text.indexOf('### Which means an unanswered field needs guarding')
  expect(from, 'the empty-answer section is gone from logic.md').toBeGreaterThan(-1)
  const section = text.slice(from, text.indexOf('\n## ', from))

  const parsed: Array<{ cel: string; claim: string }> = []
  for (const line of section.split('\n')) {
    const cells = line.split('|').map((cell) => cell.trim())
    if (cells.length !== 4) continue
    const [, condition, claim] = cells as [string, string, string]
    const cel = /^`(.+)`$/.exec(condition)?.[1]
    if (cel === undefined || claim === '' || /^-+$/.test(claim)) continue
    parsed.push({ cel, claim })
  }
  return parsed
}

describe('what the empty-answer table in logic.md claims', () => {
  test('is a table at all, with every row the page shows', () => {
    // A guard on the guard. If the parse silently found nothing, every
    // assertion below would be vacuous — and this one has seven rows because
    // seven is what the prose argues with: four that error and three that work.
    expect(rows().map(({ cel }) => cel)).toEqual([
      '!needsVisa',
      'address.country == "CH"',
      'address.country != null && address.country == "CH"',
      'age > 18.0',
      'needsVisa != true',
      'has(address.country) && address.country == "CH"',
      'age != null && age > 18.0',
    ])
  })

  test('and every row is what the engine actually does', () => {
    const wrong = rows()
      .map(({ cel, claim }) => {
        // The prose says "**errors** — …" or gives the value as a literal.
        const expected = claim.includes('errors') ? 'errors' : /`(true|false)`/.exec(claim)?.[1]
        const actual = verdictOf(cel)
        return expected === actual ? undefined : `${cel}: page says ${String(expected)}, engine says ${actual}`
      })
      .filter((problem) => problem !== undefined)

    expect(wrong).toEqual([])
  })

  test('and the two that work keep working once the answer is given', () => {
    /*
     * The other half, and the half a guard against erroring alone would miss: a
     * condition that never errors and is also never true is not a working
     * guard, it is a field nobody can reach. `has(...)` has to answer `false`
     * empty AND `true` once the group is filled in, or the advice on that page
     * trades one silent failure for another.
     */
    const form = createFormEngine({
      schema: documentFor('has(address.country) && address.country == "CH"'),
      capabilities: { now: () => 0, today: () => '2026-10-02', random: () => 0.5 },
    })

    expect(form.getFieldSnapshot(['notice']).visible).toBe(false)
    form.setValue(['address', 'country'], 'CH')
    expect(form.getFieldSnapshot(['notice']).visible).toBe(true)
  })
})
