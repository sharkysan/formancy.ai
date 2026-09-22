import { beforeEach, describe, expect, test } from 'vitest'
import type { FormSchema } from '@formancy/spec'
import { createSubmission, exportCsv, setFormAccess, listForms, listSubmissions, listVersions, publishForm, resolveForm, resumeDraft, saveDraft } from './use-cases.js'
import type { ServerDeps } from './use-cases.js'
import { createMemoryStorage } from './testing/memory-storage.js'

const schema: FormSchema = {
  specVersion: '1',
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
      actor: 'authenticated',
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
      actor: 'authenticated',
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
      actor: 'authenticated',
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
      actor: 'authenticated',
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
      actor: 'authenticated',
      data: {},
    })

    expect(outcome).toMatchObject({ ok: false, kind: 'unknown_form' })
  })
})

describe('listSubmissions', () => {
  test('returns the submissions of one form, newest first, version-tagged', async () => {
    const published = await publishForm(deps, { path: 'contact-us', schema })
    if (!published.ok) throw new Error('publish failed')
    await createSubmission(deps, {
      path: 'contact-us',
      declaredSchemaHash: published.schemaHash,
      actor: 'authenticated',
      data: { email: 'first@b.ch' },
    })
    await createSubmission(deps, {
      path: 'contact-us',
      declaredSchemaHash: published.schemaHash,
      actor: 'authenticated',
      data: { email: 'second@b.ch' },
    })

    const listed = await listSubmissions(deps, 'contact-us')

    expect(listed).not.toBeUndefined()
    expect(listed!.map((s) => (s.data as { email: string }).email)).toEqual([
      'second@b.ch',
      'first@b.ch',
    ])
    expect(listed![0]!.version).toBe(1)
  })

  test('an unknown form is undefined, not an empty list — the caller must 404', async () => {
    expect(await listSubmissions(deps, 'ghost')).toBeUndefined()
  })
})

describe('exportCsv', () => {
  test('unions columns across schema versions: old columns survive, new ones appear', async () => {
    const v1 = await publishForm(deps, { path: 'contact-us', schema })
    if (!v1.ok) throw new Error('publish failed')
    await createSubmission(deps, {
      path: 'contact-us',
      declaredSchemaHash: v1.schemaHash,
      actor: 'authenticated',
      data: { email: 'old@b.ch', country: 'CH', canton: 'ZH' },
    })

    // v2 drops canton and adds a phone field.
    const evolved = {
      ...schema,
      model: {
        fields: [
          { key: 'email', type: 'text', required: true },
          { key: 'phone', type: 'text' },
          { key: 'price', type: 'number' },
          { key: 'qty', type: 'number' },
          { key: 'total', type: 'number' },
        ],
      },
      logic: { rules: [{ target: 'total', kind: 'computed', cel: 'price * qty' }] },
    } as typeof schema
    const v2 = await publishForm(deps, { path: 'contact-us', schema: evolved })
    if (!v2.ok) throw new Error('publish failed')
    await createSubmission(deps, {
      path: 'contact-us',
      declaredSchemaHash: v2.schemaHash,
      actor: 'authenticated',
      data: { email: 'new@b.ch', phone: '+41' },
    })

    const csv = await exportCsv(deps, 'contact-us')

    expect(csv).not.toBeUndefined()
    const [header, ...rows] = csv!.trim().split('\n')
    // Current version's column order leads; extinct columns keep their data at the end.
    expect(header).toBe('id,submittedAt,version,email,phone,price,qty,total,country,canton')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toContain('new@b.ch')
    expect(rows[0]).toContain('+41')
    expect(rows[1]).toContain('old@b.ch')
    expect(rows[1]).toContain('ZH')
  })

  test('escapes quotes, commas and newlines the CSV way', async () => {
    const published = await publishForm(deps, { path: 'contact-us', schema })
    if (!published.ok) throw new Error('publish failed')
    await createSubmission(deps, {
      path: 'contact-us',
      declaredSchemaHash: published.schemaHash,
      actor: 'authenticated',
      data: { email: 'a@b.ch', country: 'says "hi", twice' },
    })

    const csv = await exportCsv(deps, 'contact-us')

    expect(csv).toContain('"says ""hi"", twice"')
  })

  test('a repeater column carries its rows as JSON in one cell', async () => {
    const { logic: _dropped, ...withoutLogic } = schema
    const withRows = {
      ...withoutLogic,
      model: {
        fields: [
          { key: 'email', type: 'text', required: true },
          {
            key: 'items',
            type: 'repeater',
            fields: [{ key: 'name', type: 'text' }],
          },
        ],
      },
    } as unknown as typeof schema
    const published = await publishForm(deps, { path: 'orders', schema: withRows })
    if (!published.ok) throw new Error('publish failed')
    await createSubmission(deps, {
      path: 'orders',
      declaredSchemaHash: published.schemaHash,
      actor: 'authenticated',
      data: { email: 'a@b.ch', items: [{ name: 'x' }] },
    })

    const csv = await exportCsv(deps, 'orders')

    expect(csv!.split('\n')[0]).toContain('items')
    // The row carries its _id into the export on purpose: an export read years
    // later should still be able to say which row an answer belonged to, which
    // is the whole reason the id lives in the data rather than beside it.
    expect(csv).toContain('"[{""name"":""x"",""_id"":""r1""}]"')
  })
})

describe('drafts', () => {
  test('an autosaved draft comes back bound to the version it was written under', async () => {
    const published = await publishForm(deps, { path: 'contact-us', schema })
    if (!published.ok) throw new Error('publish failed')

    await saveDraft(deps, { path: 'contact-us', draftId: 'd1', data: { email: 'wip@b.ch' } })
    const resumed = await resumeDraft(deps, { path: 'contact-us', draftId: 'd1' })

    expect(resumed).toMatchObject({
      outcome: 'resumed',
      data: { email: 'wip@b.ch' },
      version: 1,
    })
  })

  test('a compatible republish rebinds the draft silently', async () => {
    const v1 = await publishForm(deps, { path: 'contact-us', schema })
    if (!v1.ok) throw new Error('publish failed')
    await saveDraft(deps, { path: 'contact-us', draftId: 'd1', data: { email: 'wip@b.ch' } })

    // Adding an optional field is compatible.
    const evolved = {
      ...schema,
      model: { fields: [...schema.model.fields, { key: 'note', type: 'text' }] },
    } as typeof schema
    await publishForm(deps, { path: 'contact-us', schema: evolved })

    const resumed = await resumeDraft(deps, { path: 'contact-us', draftId: 'd1' })

    expect(resumed).toMatchObject({ outcome: 'resumed', version: 2 })
    expect(resumed && 'migration' in resumed ? resumed.migration : undefined).toBeUndefined()
  })

  test('a lossy republish rebinds with a migration report, orphaning rather than deleting', async () => {
    const v1 = await publishForm(deps, { path: 'contact-us', schema })
    if (!v1.ok) throw new Error('publish failed')
    await saveDraft(deps, {
      path: 'contact-us',
      draftId: 'd1',
      data: { email: 'wip@b.ch', country: 'CH' },
    })

    // Dropping country is lossy.
    const evolved = {
      ...schema,
      model: { fields: schema.model.fields.filter((f) => f.key !== 'country' && f.key !== 'canton') },
      logic: { rules: [{ target: 'total', kind: 'computed', cel: 'price * qty' }] },
    } as typeof schema
    await publishForm(deps, { path: 'contact-us', schema: evolved })

    const resumed = await resumeDraft(deps, { path: 'contact-us', draftId: 'd1' })

    expect(resumed).toMatchObject({ outcome: 'resumed', version: 2 })
    if (resumed?.outcome !== 'resumed') throw new Error('unexpected outcome')
    expect(resumed.migration).toBeDefined()
    expect(resumed.migration!.severity).toBe('lossy')
    const data = resumed.data as Record<string, unknown>
    // The value the removed field held is not deleted: it moves aside.
    expect('country' in data).toBe(false)
    expect((data['__orphaned'] as Record<string, unknown>)['country']).toBe('CH')
    expect(data['email']).toBe('wip@b.ch')
  })

  test('a breaking republish returns the draft read-only against its original version', async () => {
    // Published as spec 2 so the republish below can go DOWN a version, which
    // is the breaking direction: version 2 only adds, so moving up rebinds
    // silently, and moving down leaves whatever was added with nowhere to go.
    // (This test used to bump 1 to 2 for its breaking change, on the reasoning
    // that any bump must be breaking. Spec 2 exists now and that was wrong.)
    const v1 = await publishForm(deps, { path: 'contact-us', schema: { ...schema, specVersion: '2' } })
    if (!v1.ok) throw new Error('publish failed')
    await saveDraft(deps, { path: 'contact-us', draftId: 'd1', data: { email: 'wip@b.ch' } })

    const breaking = { ...schema, specVersion: '1' as const }
    const form = await deps.storage.getFormByPath('contact-us')
    await deps.storage.insertVersion({
      id: 'v-breaking',
      formId: form!.id,
      version: 99,
      schema: breaking,
      schemaHash: 'hash-breaking',
    })
    await deps.storage.setCurrentVersion(form!.id, 'v-breaking')

    const resumed = await resumeDraft(deps, { path: 'contact-us', draftId: 'd1' })

    expect(resumed).toMatchObject({ outcome: 'readOnly', version: 1 })
  })

  test('an unknown draft or form is undefined', async () => {
    expect(await resumeDraft(deps, { path: 'ghost', draftId: 'x' })).toBeUndefined()
    await publishForm(deps, { path: 'contact-us', schema })
    expect(await resumeDraft(deps, { path: 'contact-us', draftId: 'nope' })).toBeUndefined()
  })
})

describe('CSV formula injection', () => {
  test('a value that a spreadsheet would execute is neutralised with a leading apostrophe', async () => {
    const published = await publishForm(deps, { path: 'contact-us', schema })
    if (!published.ok) throw new Error('publish failed')
    await createSubmission(deps, {
      path: 'contact-us',
      declaredSchemaHash: published.schemaHash,
      actor: 'authenticated',
      data: { email: 'a@b.ch', country: '=HYPERLINK("http://evil.example","click")' },
    })
    await createSubmission(deps, {
      path: 'contact-us',
      declaredSchemaHash: published.schemaHash,
      actor: 'authenticated',
      data: { email: 'b@b.ch', country: '@SUM(1,1)' },
    })

    const csv = await exportCsv(deps, 'contact-us')

    expect(csv).toContain(`'=HYPERLINK`)
    expect(csv).toContain(`'@SUM`)
    expect(csv).not.toMatch(/(^|,)"?=HYPERLINK/m)
  })

  test('negative NUMBERS stay plain — only strings can smuggle formulas', async () => {
    const published = await publishForm(deps, { path: 'contact-us', schema })
    if (!published.ok) throw new Error('publish failed')
    await createSubmission(deps, {
      path: 'contact-us',
      declaredSchemaHash: published.schemaHash,
      actor: 'authenticated',
      data: { email: 'c@b.ch', qty: -5.0, price: 2.0 },
    })

    const csv = await exportCsv(deps, 'contact-us')
    expect(csv).toContain(',-5,')
    expect(csv).not.toContain(`'-5`)
  })
})

describe('catalog reads', () => {
  test('listForms names every form with its current version', async () => {
    await publishForm(deps, { path: 'contact-us', schema })
    await publishForm(deps, { path: 'orders', schema: { ...schema, id: 'orders' } })

    const forms = await listForms(deps)

    expect(forms.map((f) => f.path).sort()).toEqual(['contact-us', 'orders'])
    expect(forms[0]).toMatchObject({ version: 1 })
  })

  test('listVersions is newest first with hash and a field count, never the whole schema', async () => {
    await publishForm(deps, { path: 'contact-us', schema })
    await publishForm(deps, {
      path: 'contact-us',
      schema: { ...schema, title: 'Contact v2' },
    })

    const versions = await listVersions(deps, 'contact-us')

    expect(versions).not.toBeUndefined()
    expect(versions!.map((v) => v.version)).toEqual([2, 1])
    expect(versions![0]!.schemaHash).toMatch(/^[0-9a-f]{64}$/)
    expect(versions![0]!.title).toBe('Contact v2')
    expect('schema' in versions![0]!).toBe(false)
  })

  test('listVersions of an unknown form is undefined', async () => {
    expect(await listVersions(deps, 'ghost')).toBeUndefined()
  })
})

/**
 * Who may submit, and from where.
 *
 * This lives on the form RECORD rather than in the form document. A document
 * has to mean the same thing wherever it is moved — embedding "anyone may
 * submit this" in it would carry a policy across a deployment boundary where
 * it is wrong, and the spec is a data contract rather than a permission model.
 *
 * Fail-closed throughout: a form is private until somebody says otherwise, and
 * a public form accepts no origin until somebody lists one.
 */
describe('public submission access', () => {
  const publish = async (): Promise<string> => {
    const published = await publishForm(deps, { path: 'contact-us', schema })
    if (!published.ok) throw new Error('publish failed')
    return published.schemaHash
  }

  const submit = async (
    hash: string,
    context?: { actor?: 'anonymous' | 'authenticated'; origin?: string },
  ): ReturnType<typeof createSubmission> =>
    createSubmission(deps, {
      path: 'contact-us',
      declaredSchemaHash: hash,
      data: { email: 'a@b.ch' },
      actor: context?.actor ?? 'anonymous',
      ...(context?.origin === undefined ? {} : { origin: context.origin }),
    })

  test('a new form refuses anonymous submissions, because the default must be the safe one', async () => {
    const hash = await publish()

    const outcome = await submit(hash)

    expect(outcome).toMatchObject({ ok: false, kind: 'forbidden' })
  })

  test('an authenticated actor is unaffected by the public setting', async () => {
    const hash = await publish()

    expect(await submit(hash, { actor: 'authenticated' })).toMatchObject({ ok: true })
  })

  test('opening a form to the public lets an anonymous submission through', async () => {
    const hash = await publish()
    await setFormAccess(deps, { path: 'contact-us', submit: 'public' })

    expect(await submit(hash)).toMatchObject({ ok: true })
  })

  test('an origin allowlist, once set, refuses everything not on it', async () => {
    const hash = await publish()
    await setFormAccess(deps, {
      path: 'contact-us',
      submit: 'public',
      allowedOrigins: ['https://example.ch'],
    })

    expect(await submit(hash, { origin: 'https://example.ch' })).toMatchObject({ ok: true })
    expect(await submit(hash, { origin: 'https://evil.example' })).toMatchObject({
      ok: false,
      kind: 'forbidden',
    })
  })

  test('a request with no Origin header is refused once an allowlist exists', async () => {
    const hash = await publish()
    await setFormAccess(deps, {
      path: 'contact-us',
      submit: 'public',
      allowedOrigins: ['https://example.ch'],
    })

    // Absent is not the same as allowed. A caller that sends no Origin is
    // either not a browser or is hiding, and neither is on the list.
    expect(await submit(hash)).toMatchObject({ ok: false, kind: 'forbidden' })
  })

  test('an empty allowlist means no origin is allowed, not every origin', async () => {
    const hash = await publish()
    await setFormAccess(deps, { path: 'contact-us', submit: 'public', allowedOrigins: [] })

    expect(await submit(hash, { origin: 'https://example.ch' })).toMatchObject({
      ok: false,
      kind: 'forbidden',
    })
  })

  test('origins are compared exactly, so a suffix match cannot be smuggled', async () => {
    const hash = await publish()
    await setFormAccess(deps, {
      path: 'contact-us',
      submit: 'public',
      allowedOrigins: ['https://example.ch'],
    })

    for (const origin of [
      'https://evil-example.ch',
      'https://example.ch.evil.test',
      'http://example.ch',
      'https://example.ch:8443',
      'https://EXAMPLE.ch/',
    ]) {
      expect(await submit(hash, { origin }), origin).toMatchObject({ ok: false })
    }
  })
})

/**
 * A `pattern` is written by a form author and run by the server against
 * whatever a submitter typed. A catastrophic one is therefore an author-side
 * denial of service reachable by anyone who can submit the form.
 *
 * It has to be refused at publish time, because a JavaScript regular
 * expression cannot be timed out once it has started matching. The only moment
 * the cost can be declined is before the pattern is stored.
 */
describe('patterns that backtrack are refused at publish', () => {
  const withPattern = (pattern: string): unknown => ({
    specVersion: '1',
    id: 'reg',
    title: 'Reg',
    model: { fields: [{ key: 'code', type: 'text', pattern }] },
  })

  test('an exponential pattern is refused, and the form is never stored', async () => {
    const outcome = await publishForm(deps, { path: 'reg', schema: withPattern('(?:[a-z]+)+') })

    expect(outcome).toMatchObject({ ok: false, kind: 'unsafe_pattern' })
    if (outcome.ok || outcome.kind !== 'unsafe_pattern') throw new Error('unreachable')
    expect(outcome.patterns[0]).toMatchObject({ path: 'code', complexity: 'exponential' })

    // Refused means refused: nothing was persisted on the way to the error.
    expect(await deps.storage.getFormByPath('reg')).toBeUndefined()
  })

  test('a polynomial pattern is refused too, with its degree named', async () => {
    const outcome = await publishForm(deps, {
      path: 'reg',
      schema: withPattern('[^\s@]+@[^\s@]+\.[^\s@]+'),
    })

    expect(outcome).toMatchObject({ ok: false, kind: 'unsafe_pattern' })
    if (outcome.ok || outcome.kind !== 'unsafe_pattern') throw new Error('unreachable')
    expect(outcome.patterns[0]?.complexity).toBe('polynomial degree 2')
  })

  test('an ordinary pattern publishes', async () => {
    expect(await publishForm(deps, { path: 'reg', schema: withPattern('[A-Z]{2}-\d{4}') })).toMatchObject({
      ok: true,
    })
  })

  test('a pattern inside a repeater is found, and reported at its data path', async () => {
    const outcome = await publishForm(deps, {
      path: 'reg',
      schema: {
        specVersion: '1',
        id: 'reg',
        title: 'Reg',
        model: {
          fields: [
            {
              key: 'contacts',
              type: 'repeater',
              fields: [{ key: 'code', type: 'text', pattern: '(?:[a-z]+)+' }],
            },
          ],
        },
      },
    })

    expect(outcome).toMatchObject({ ok: false, kind: 'unsafe_pattern' })
    if (outcome.ok || outcome.kind !== 'unsafe_pattern') throw new Error('unreachable')
    // The same path grammar everything else uses, so an author can find it.
    expect(outcome.patterns[0]?.path).toBe('contacts[].code')
  })
})
