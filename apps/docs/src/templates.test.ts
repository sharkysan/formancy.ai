import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { validateSchema } from '@formancy/spec/validate'
import type { FormSchema } from '@formancy/spec'
import { createFormEngine, engineRefusal, expressionProblems, runScenarios } from '@formancy/core'
import type { Scenario } from '@formancy/core'

const root = fileURLToPath(new URL('../../../templates/', import.meta.url))
const read = <T>(path: string): T => JSON.parse(readFileSync(join(root, path), 'utf8')) as T
interface Entry { id: string; area: string; schema: string; sample: string; scenarios: string }
const catalog = read<{ templates: Entry[] }>('catalog.json')
const capabilities = { now: () => 1791244800000, today: () => '2026-10-06', random: () => 0.5 }

// These files are shipped as the import contract. A valid-looking sample that
// cannot be submitted, or a conditional with the opposite meaning, is a broken template.
describe('starter template collection', () => {
  test('catalogues every form exactly once and keeps examples outside the schema', () => {
    /*
     * `/` on both sides. `readdirSync` returns the platform's separator, so on
     * Windows this compared `hr\leave-request.form.json` against the catalogue's
     * `hr/leave-request.form.json` and reported all eighteen entries as both
     * missing and unexpected — a guard that cannot run where somebody is
     * working, which is the same class of problem as one that is not a gate.
     *
     * The catalogue's spelling is the contract: `template-gallery.tsx` builds
     * `import.meta.glob` keys from it, and those are forward slashes whatever
     * the platform.
     */
    const paths = readdirSync(root, { recursive: true })
      .filter((p): p is string => typeof p === 'string')
      .map((p) => p.replaceAll('\\', '/'))
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

      /*
       * One runner, not two. This used to set values and compare the engine's
       * answers inline, right here — which made the capability the product
       * needs available to this file and to nobody else: not to a form author,
       * not to a consumer's CI, not to an agent about to publish. It is
       * `runScenarios` in `@formancy/core` now
       * ([0110](../../../docs/decisions/0110-a-form-is-checked-against-examples.md)),
       * and these eighteen templates are what exercises it.
       */
      test(`${entry.id}: every scenario still holds (${mode})`, () => {
        const results = runScenarios(schema, scenarios, {
          initialValue: sample,
          mode,
          capabilities,
        })

        // Named, so a failure says which example stopped holding and how,
        // rather than which index of an array returned false.
        const broken = results
          .filter((result) => !result.passed)
          .map((result) => `${result.name}: ${result.failures.map((f) => f.detail).join(' ')}`)
        expect(broken).toEqual([])
        // A set that ran nothing would pass the line above.
        expect(results).toHaveLength(scenarios.length)
      })
    }
  }
})
