import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { createFormEngine, engineRefusal } from '@formancy/core'
import type { FieldDef, FormSchema } from '@formancy/spec'

/**
 * What `concepts/logic.md` says a dependency is, held to the engine: every rule the page says is
 * accepted or refused, and the cycle it quotes for a field reading its group whole. Each is taken
 * out of the page and built, so the page cannot go on offering an example the engine refuses,
 * promise a refusal the engine does not make, or quote a cycle the engine names otherwise.
 */
const here = dirname(fileURLToPath(import.meta.url))
const page = readFileSync(join(here, 'content', 'docs', 'concepts', 'logic.md'), 'utf8')

const CLOCK = { now: () => 0, today: () => '2026-11-22', random: () => 0.5 }

/** The page's paragraphs on what a dependency is, up to the one on what changed, on one line. */
function passage(): string {
  const from = page.indexOf('\nA dependency is a field')
  const to = page.indexOf('\nBefore 2026-11-22 a dependency', from)
  expect(from, 'the paragraphs on what a dependency is are gone from logic.md').toBeGreaterThan(-1)
  expect(to, 'the paragraph on what changed is gone from logic.md').toBeGreaterThan(from)
  return page.slice(from, to).replaceAll('\n', ' ')
}

/** The first match of `pattern` in the passage, its groups as written. */
function quoted(pattern: RegExp): string[] {
  const match = pattern.exec(passage())
  expect(match, `logic.md's passage no longer quotes ${String(pattern)}`).not.toBeNull()
  return match!.slice(1)
}

/**
 * Every field the page's examples name, where it puts them: a group of an address, a list inside an
 * order and the same list at the top level. A field the page names and this lacks makes its rule
 * read nothing, which the cases below would report as the page being wrong, so it is added here.
 */
const lines: FieldDef = {
  key: 'lines',
  type: 'repeater',
  fields: [
    { key: 'qty', type: 'number' },
    { key: 'count', type: 'number' },
  ],
}
const FIELDS: FieldDef[] = [
  {
    key: 'addr',
    type: 'group',
    fields: [
      { key: 'city', type: 'text' },
      { key: 'label', type: 'text' },
    ],
  },
  { key: 'order', type: 'group', fields: [{ key: 'note', type: 'text' }, lines] },
  lines,
]

const withRule = (target: string, cel: string): FormSchema => ({
  specVersion: '1',
  id: 'dependencies',
  title: 'Dependencies',
  model: { fields: FIELDS },
  logic: { rules: [{ target, kind: 'computed', cel }] },
})

describe('what logic.md says a dependency is', () => {
  test('every rule it says is accepted the engine opens, and every rule it says is refused it refuses', () => {
    // Inside a group a row may read its own list whole and at the top level it may not; a page that
    // said either the other way round would send an author to write a form that does not open, or
    // away from one that does.
    const claims = [...passage().matchAll(/`([\w.[\]]+)` computed as `([^`]+)` is (accepted|refused)/g)]
    expect(claims.length, 'logic.md names no rule as accepted or refused').toBeGreaterThan(3)
    expect(new Set(claims.map((claim) => claim[3])), 'logic.md names no rule of one kind').toEqual(new Set(['accepted', 'refused']))

    for (const [, target, cel, verdict] of claims) {
      const refusal = engineRefusal(withRule(target!, cel!))
      if (verdict === 'accepted') expect(refusal, `${target} = ${cel}`).toBeUndefined()
      else expect(refusal, `${target} = ${cel}`).toMatch(/^Dependency cycle: /)
    }
  })

  test('a computed field in a group reads another field of the group, as the page shows', () => {
    // The page's own example, refused as "addr -> addr" while a dependency was a top-level name.
    const [target, cel] = quoted(/`(addr\.\w+)` computed as `([^`]+)` is accepted/) as [string, string]
    const engine = createFormEngine({ schema: withRule(target, cel), capabilities: CLOCK, initialValue: { addr: { city: 'Bern' } } })

    expect(engine.getFieldSnapshot(target.split('.')).value).toBe('in Bern')
  })

  test('one reading its group whole is refused with the cycle the page quotes', () => {
    // The page names the read and the trace; the engine has to agree on both, so a trace that
    // went back to naming the group fails here rather than in a reader's head.
    const [whole] = quoted(/`(size\(\w+\))` reads the whole group/) as [string]
    const [cycle] = quoted(/named by its fields: `([^`]+)`/) as [string]

    expect(engineRefusal(withRule(cycle.split(' -> ')[0]!, `string(${whole})`))).toBe(`Dependency cycle: ${cycle}`)
  })
})
