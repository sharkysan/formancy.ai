import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { validateSchema } from '@formancy/spec/validate'
import type { FormSchema } from '@formancy/spec'
import { createFormEngine, engineRefusal, expressionProblems, parsePath } from '@formancy/core'

const root = fileURLToPath(new URL('../../../templates/', import.meta.url))
const read = <T>(path: string): T => JSON.parse(readFileSync(join(root, path), 'utf8')) as T
interface Entry { id: string; area: string; schema: string; sample: string; scenarios: string }
interface Scenario {
  name: string
  changes: Record<string, unknown>
  valid: boolean
  errors?: Record<string, string[]>
  visible?: Record<string, boolean>
  values?: Record<string, unknown>
  absent?: string[]
}
const catalog = read<{ templates: Entry[] }>('catalog.json')
const capabilities = { now: () => 1791244800000, today: () => '2026-10-06', random: () => 0.5 }

// These files are shipped as the import contract. A valid-looking sample that
// cannot be submitted, or a conditional with the opposite meaning, is a broken template.
describe('starter template collection', () => {
  test('catalogues every form exactly once and keeps examples outside the schema', () => {
    const paths = readdirSync(root, { recursive: true }).filter((p): p is string => typeof p === 'string')
    expect(catalog.templates.map((e) => e.schema).sort()).toEqual(paths.filter((p) => p.endsWith('.form.json')).sort())
    expect(new Set(catalog.templates.map((e) => e.id)).size).toBe(catalog.templates.length)
    expect([...new Set(catalog.templates.map((e) => e.area))].sort()).toEqual([
      'customer-service', 'events', 'healthcare-administration', 'hr', 'operations', 'sales',
    ])
  })

  for (const entry of catalog.templates) {
    const schema = read<FormSchema>(entry.schema)
    const sample = read<Record<string, unknown>>(entry.sample)
    const scenarios = read<Scenario[]>(entry.scenarios)

    test(`${entry.id}: imports, compiles, and resolves every authored text in all locales`, () => {
      expect(validateSchema(schema)).toMatchObject({ valid: true })
      expect(schema.id).toBe(entry.id)
      expect(engineRefusal(schema)).toBeUndefined()
      expect(expressionProblems(schema)).toEqual([])
      const refs = [...JSON.stringify(schema).matchAll(/"\$t":"([^"]+)"/g)].map((m) => m[1]!)
      expect(refs.length).toBeGreaterThan(0)
      for (const locale of ['en', 'de', 'fr']) {
        for (const ref of refs) expect(schema.i18n?.messages[locale]?.[ref], `${locale}:${ref}`).toBeTruthy()
      }
      // Templates do not silently depend on an uploader, remote choices or host checks.
      expect(JSON.stringify(schema)).not.toMatch(/"(?:optionsSource|check)":|"type":"file"/)
      expect(scenarios.some((s) => !s.valid)).toBe(true)
      expect(scenarios.some((s) => Object.values(s.visible ?? {}).includes(false))).toBe(true)
    })

    for (const mode of ['client', 'server'] as const) {
      test(`${entry.id}: the fictional sample submits in ${mode} mode`, () => {
        const engine = createFormEngine({ schema, initialValue: sample, mode, capabilities })
        expect(engine.validate()).toEqual({ valid: true, errors: {} })
        expect(engine.submit()).toEqual({ ok: true, errors: {} })
      })

      for (const scenario of scenarios) {
        test(`${entry.id}: ${scenario.name} (${mode})`, () => {
          const engine = createFormEngine({ schema, initialValue: sample, mode, capabilities })
          // Set values through the live engine: turning off a branch must clear
          // what somebody already typed, not just hide an initially empty field.
          for (const [path, value] of Object.entries(scenario.changes)) engine.setValue(parsePath(path), value)
          const report = engine.validate()
          expect(report.valid).toBe(scenario.valid)
          expect(report.errors).toEqual(scenario.errors ?? {})
          for (const [path, visible] of Object.entries(scenario.visible ?? {})) {
            expect(engine.getFieldSnapshot(parsePath(path)).visible).toBe(visible)
          }
          for (const [path, value] of Object.entries(scenario.values ?? {})) {
            expect(engine.getFieldSnapshot(parsePath(path)).value).toEqual(value)
          }
          const value = engine.value() as Record<string, unknown>
          for (const path of scenario.absent ?? []) expect(value).not.toHaveProperty(path)
        })
      }
    }
  }
})
