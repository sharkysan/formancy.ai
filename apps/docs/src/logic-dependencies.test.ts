import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { createFormEngine, engineRefusal } from '@formancy/core'
import type { FormSchema, LogicRule } from '@formancy/spec'

/**
 * What `concepts/logic.md` says a dependency is, held to the engine: the expression it gives for
 * a computed field reading another field of its group, and the cycle it quotes for one reading the
 * group whole. Both are taken out of the page and run, so the page cannot go on offering an
 * example the engine refuses, or quote a cycle the engine names otherwise.
 */
const here = dirname(fileURLToPath(import.meta.url))
const page = readFileSync(join(here, 'content', 'docs', 'concepts', 'logic.md'), 'utf8')

const CLOCK = { now: () => 0, today: () => '2026-11-22', random: () => 0.5 }

/** The page's paragraph on what a dependency is, up to the next blank line. */
function paragraph(): string {
  const from = page.indexOf('\nA dependency is a field')
  expect(from, 'the paragraph on what a dependency is is gone from logic.md').toBeGreaterThan(-1)
  return page.slice(from, page.indexOf('\n\n', from + 1))
}

/** The first match of `pattern` in the paragraph, its groups as written. */
function quoted(pattern: RegExp): string[] {
  const match = pattern.exec(paragraph().replaceAll('\n', ' '))
  expect(match, `logic.md's paragraph no longer quotes ${String(pattern)}`).not.toBeNull()
  return match!.slice(1)
}

/** A group holding every member the paragraph names in it, under one computed rule. */
function grouped(group: string, rule: LogicRule): FormSchema {
  const members = new Set([...paragraph().matchAll(new RegExp(`\\b${group}\\.(\\w+)`, 'g'))].map((match) => match[1]!))
  return {
    specVersion: '1',
    id: 'dependencies',
    title: 'Dependencies',
    model: { fields: [{ key: group, type: 'group', fields: [...members].map((key) => ({ key, type: 'text' as const })) }] },
    logic: { rules: [rule] },
  }
}

describe('what logic.md says a dependency is', () => {
  test('a computed field in a group reads another field of the group, as the page shows', () => {
    // The page's own example, refused as "addr -> addr" while a dependency was a top-level name.
    const [target, cel] = quoted(/`(\w+\.\w+)` computed as `([^`]+)` is accepted/) as [string, string]
    const schema = grouped(target.split('.')[0]!, { target, kind: 'computed', cel })

    expect(engineRefusal(schema)).toBeUndefined()
    const engine = createFormEngine({ schema, capabilities: CLOCK, initialValue: { addr: { city: 'Bern' } } })
    expect(engine.getFieldSnapshot(target.split('.')).value).toBe('in Bern')
  })

  test('one reading its group whole is refused with the cycle the page quotes', () => {
    // The page names the read and the trace; the engine has to agree on both, so a trace that
    // went back to naming the group fails here rather than in a reader's head.
    const [whole] = quoted(/`(size\(\w+\))` reads the whole group/) as [string]
    const [cycle] = quoted(/named by its fields: `([^`]+)`/) as [string]
    const target = cycle.split(' -> ')[0]!
    const schema = grouped(target.split('.')[0]!, { target, kind: 'computed', cel: `string(${whole})` })

    expect(engineRefusal(schema)).toBe(`Dependency cycle: ${cycle}`)
  })
})
