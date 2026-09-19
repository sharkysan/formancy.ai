import { beforeEach, describe, expect, test } from 'vitest'
import type { FormSchema } from '@formancy/spec'
import { createSubmission, publishForm, resolveForm } from './use-cases.js'
import type { ServerDeps } from './use-cases.js'
import { createMemoryStorage } from './testing/memory-storage.js'

const schema: FormSchema = {
  specVersion: '0',
  id: 'contact',
  title: 'Contact',
  model: {
    fields: [
      { key: 'country', type: 'select' },
      { key: 'canton', type: 'text' },
      { key: 'email', type: 'text', required: true },
      { key: 'price', type: 'number' },
      { key: 'qty', type: 'number' },
      { key: 'total', type: 'number' },
    ],
  },
  logic: {
    rules: [
      { target: 'canton', kind: 'visible', cel: 'country == "CH"' },
      { target: 'total', kind: 'computed', cel: 'price * qty' },
    ],
  },
}

let deps: ServerDeps
beforeEach(() => {
  let counter = 0
  deps = {
    storage: createMemoryStorage(),
    newId: () => `id-${++counter}`,
    capabilities: { now: () => 1_726_000_000_000, today: () => '2026-09-19', random: () => 0.5 },
    nowIso: () => '2026-09-19T12:00:00Z',
  }
})

describe('publishForm', () => {
  test('creates version 1 with the canonical hash and makes it current', async () => {
    const outcome = await publishForm(deps, { path: 'contact-us', schema })

    expect(outcome).toMatchObject({ ok: true, version: 1 })
    if (!outcome.ok) return
    const resolved = await resolveForm(deps, 'contact-us')
    expect(resolved?.schemaHash).toBe(outcome.schemaHash)
    expect(resolved?.version).toBe(1)
  })

  test('republishing the identical schema is idempotent: no new version', async () => {
    await publishForm(deps, { path: 'contact-us', schema })
    const second = await publishForm(deps, { path: 'contact-us', schema })

    expect(second).toMatchObject({ ok: true, version: 1 })
  })

  test('a changed schema bumps the version and flips current', async () => {
    await publishForm(deps, { path: 'contact-us', schema })
    const changed = { ...schema, title: 'Contact us' }
    const outcome = await publishForm(deps, { path: 'contact-us', schema: changed })

    expect(outcome).toMatchObject({ ok: true, version: 2 })
    expect((await resolveForm(deps, 'contact-us'))?.version).toBe(2)
  })

  test('an invalid document is rejected with the author-facing errors', async () => {
    const outcome = await publishForm(deps, { path: 'x', schema: { nonsense: true } })

    expect(outcome.ok).toBe(false)
    if (outcome.ok || outcome.kind !== 'invalid_schema') throw new Error('wrong outcome kind')
    expect(outcome.errors!.length).toBeGreaterThan(0)
  })

  test('a cyclic logic graph is rejected at publish, never persisted', async () => {
    const cyclic: FormSchema = {
      ...schema,
      logic: {
        rules: [
          { target: 'price', kind: 'computed', cel: 'qty * 1.0' },
          { target: 'qty', kind: 'computed', cel: 'price * 1.0' },
        ],
      },
    }
    const outcome = await publishForm(deps, { path: 'x', schema: cyclic })

    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.kind).toBe('invalid_logic')
    expect(await resolveForm(deps, 'x')).toBeUndefined()
  })
})

describe('createSubmission', () => {
  test('accepts a valid submission and binds it to the exact version', async () => {
    const published = await publishForm(deps, { path: 'contact-us', schema })
    if (!published.ok) throw new Error('publish failed')

    const outcome = await createSubmission(deps, {
      path: 'contact-us',
      declaredSchemaHash: published.schemaHash,
      data: { email: 'a@b.ch' },
    })

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    const stored = await deps.storage.listSubmissions()
    expect(stored).toHaveLength(1)
    expect(stored[0]!.formVersionId).toBe(published.versionId)
  })

  test('a stale or unknown declared hash is refused with the CURRENT schema attached', async () => {
    const published = await publishForm(deps, { path: 'contact-us', schema })
    if (!published.ok) throw new Error('publish failed')

    const outcome = await createSubmission(deps, {
      path: 'contact-us',
      declaredSchemaHash: 'deadbeef',
      data: { email: 'a@b.ch' },
    })

    expect(outcome.ok).toBe(false)
    if (outcome.ok || outcome.kind !== 'version_changed') throw new Error('wrong outcome kind')
    expect(outcome.current?.schemaHash).toBe(published.schemaHash)
  })

  test('an invalid submission reports the same error shape the client computes', async () => {
    const published = await publishForm(deps, { path: 'contact-us', schema })
    if (!published.ok) throw new Error('publish failed')

    const outcome = await createSubmission(deps, {
      path: 'contact-us',
      declaredSchemaHash: published.schemaHash,
      data: {},
    })

    expect(outcome.ok).toBe(false)
    if (outcome.ok || outcome.kind !== 'invalid') throw new Error('wrong outcome kind')
    expect(outcome.errors).toEqual({ email: ['required'] })
  })

  test('never trusts the client: hidden-branch data is stripped and computed lies are overwritten', async () => {
    const published = await publishForm(deps, { path: 'contact-us', schema })
    if (!published.ok) throw new Error('publish failed')

    const outcome = await createSubmission(deps, {
      path: 'contact-us',
      declaredSchemaHash: published.schemaHash,
      data: {
        email: 'a@b.ch',
        country: 'DE',
        canton: 'SMUGGLED',
        price: 10.0,
        qty: 2.0,
        total: 999999,
      },
    })

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    const canonical = outcome.canonicalData as Record<string, unknown>
    expect('canton' in canonical).toBe(false)
    expect(canonical['total']).toBe(20)
  })

  test('an unknown form path is its own failure kind', async () => {
    const outcome = await createSubmission(deps, {
      path: 'ghost',
      declaredSchemaHash: 'x',
      data: {},
    })

    expect(outcome).toMatchObject({ ok: false, kind: 'unknown_form' })
  })
})
