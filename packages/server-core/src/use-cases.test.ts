import { beforeEach, describe, expect, test } from 'vitest'
import type { FormSchema } from '@formancy/spec'
import { MIXED_NUMERIC_LITERAL_EXAMPLE } from '@formancy/core'
import { createSubmission, exportCsv, setFormAccess, listForms, listSubmissions, listVersions, resolveForm, resumeDraft, saveDraft, startDraft } from './use-cases.js'
import { publishForm } from './publishing.js'
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
    draftSecret: 'a-test-signing-key-of-adequate-length',
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

  test('records the lists a version needs the deployment to resolve', async () => {
    // `SAFETY-ANALYSIS.md` A7 tells a manufacturer to treat `optionsSource` as a
    // per-field weakening of the "an answer is one of the options" guarantee,
    // "enumerable from the publish audit detail". It was not: the detail held the
    // version and the hash, so the document described a record that did not exist.
    //
    // An operator comparing a form's sources against their own configuration is exactly
    // the use that sentence names, and the publish record is the only place the pairing
    // is frozen -- so this is the assertion that keeps the sentence honest.
    await publishForm(deps, {
      path: 'sourced',
      schema: {
        specVersion: '2',
        id: 'sourced',
        title: 'Sourced',
        model: {
          fields: [
            { key: 'canton', type: 'select', label: 'Canton', optionsSource: 'cantons' },
            { key: 'town', type: 'select', label: 'Town', optionsSource: 'towns' },
            { key: 'again', type: 'select', label: 'Again', optionsSource: 'cantons' },
          ],
        },
      } as unknown as FormSchema,
    })

    const entry = (await deps.storage.listAudit(10)).find((row) => row.subject === 'sourced')
    // Sorted and once each, so two forms naming the same lists produce the same string
    // and a reader can compare them without parsing.
    expect(entry?.detail?.['optionsSources']).toBe('cantons, towns')
  })

  test('says nothing about sources when a form names none', async () => {
    // An audit row that grew a field saying "none" would make every form look like it
    // had something to check.
    await publishForm(deps, { path: 'contact-us', schema })

    const entry = (await deps.storage.listAudit(10)).find((row) => row.subject === 'contact-us')
    expect(entry?.detail).toBeDefined()
    expect(entry?.detail && 'optionsSources' in entry.detail).toBe(false)
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

  test('refuses an expression that compiles and then never works', async () => {
    // `qty * 4` type-checks — the engine declares leaves as `dyn` so that a
    // half-typed answer is not an error — and then fails at runtime for every
    // value, because a JSON number is a double and CEL will not widen an int.
    // The engine cannot refuse it, so the save gate does.
    const silent: FormSchema = {
      ...schema,
      logic: { rules: [{ target: 'price', kind: 'computed', cel: 'qty * 4' }] },
    }

    const outcome = await publishForm(deps, { path: 'x', schema: silent })

    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.kind).toBe('invalid_logic')
    if (outcome.kind !== 'invalid_logic') return
    expect(outcome.message).toContain(MIXED_NUMERIC_LITERAL_EXAMPLE)
    expect(await resolveForm(deps, 'x')).toBeUndefined()
  })

  test('publishes it once the literal has a decimal point', async () => {
    const fixed: FormSchema = {
      ...schema,
      logic: { rules: [{ target: 'price', kind: 'computed', cel: 'qty * 4.0' }] },
    }

    expect((await publishForm(deps, { path: 'x', schema: fixed })).ok).toBe(true)
  })

  test('reports every expression that can never work in one publish attempt', async () => {
    const broken: FormSchema = {
      ...schema,
      logic: {
        rules: [
          { target: 'price', kind: 'computed', cel: 'qty * 4' },
          { target: 'total', kind: 'computed', cel: 'price * 4' },
        ],
      },
    }

    const outcome = await publishForm(deps, { path: 'x', schema: broken })

    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.kind).toBe('invalid_logic')
    if (outcome.kind !== 'invalid_logic') return
    expect(outcome.message).toContain('Rule on "price"')
    expect(outcome.message).toContain('Rule on "total"')
    expect(outcome.message.split('\n')).toHaveLength(2)
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

describe('a draft belongs to whoever started it', () => {
  /**
   * The public plane is anonymous, so a draft has no account behind it — and
   * that is precisely why it needs a secret of its own.
   *
   * A draft holds whatever the form asks for: a name, an address, a complaint,
   * medical history. Addressing one by an id the CLIENT chose meant anybody who
   * knew or guessed an id could read it, and — worse — overwrite it. The
   * person then submits the substituted content under their own name and the
   * server has no way to tell.
   *
   * So the server mints the id and a token over it, and both saving and
   * resuming require the token. Stateless, the same shape the proof-of-work
   * challenge uses ([0059](../../../docs/decisions/0059-proof-of-work-not-a-captcha.md)):
   * HMAC over the id with an expiry inside, so no second table and no lookup
   * before the check.
   */
  test('starting one returns an id nobody chose and a token over it', async () => {
    const published = await publishForm(deps, { path: 'contact-us', schema })
    if (!published.ok) throw new Error('publish failed')

    const first = await startDraft(deps, { path: 'contact-us' })
    const second = await startDraft(deps, { path: 'contact-us' })

    expect(first?.draftId).toBeTruthy()
    expect(first?.token).toBeTruthy()

    // Two starts are two drafts, each with its own token. Asserted rather than
    // the id's length: how unguessable the id is belongs to the host's `newId`,
    // and it is no longer what protects the draft -- the TOKEN is, which is the
    // point of having one. An id a caller supplies is an id a caller can
    // enumerate, and enumerating them used to be enough.
    expect(first?.draftId).not.toBe(second?.draftId)
    expect(first?.token).not.toBe(second?.token)
  })

  test('saving with the token works, and without it does not', async () => {
    const published = await publishForm(deps, { path: 'contact-us', schema })
    if (!published.ok) throw new Error('publish failed')
    const started = await startDraft(deps, { path: 'contact-us' })
    if (started === undefined) throw new Error('start failed')

    const ok = await saveDraft(deps, {
      path: 'contact-us',
      draftId: started.draftId,
      token: started.token,
      data: { email: 'wip@b.ch' },
    })
    expect(ok?.saved).toBe(true)

    const forged = await saveDraft(deps, {
      path: 'contact-us',
      draftId: started.draftId,
      token: 'not-the-token',
      data: { email: 'attacker@b.ch' },
    })
    // Overwriting is the worse half: the person submits the substituted
    // content under their own name and nothing says otherwise.
    expect(forged?.saved).toBe(false)
  })

  test('resuming without the token does not return the answers', async () => {
    const published = await publishForm(deps, { path: 'contact-us', schema })
    if (!published.ok) throw new Error('publish failed')
    const started = await startDraft(deps, { path: 'contact-us' })
    if (started === undefined) throw new Error('start failed')
    await saveDraft(deps, {
      path: 'contact-us',
      draftId: started.draftId,
      token: started.token,
      data: { email: 'private@b.ch' },
    })

    const withToken = await resumeDraft(deps, {
      path: 'contact-us',
      draftId: started.draftId,
      token: started.token,
    })
    expect(withToken).toMatchObject({ outcome: 'resumed', data: { email: 'private@b.ch' } })

    const without = await resumeDraft(deps, {
      path: 'contact-us',
      draftId: started.draftId,
      token: 'not-the-token',
    })
    // Refused, and told apart from "no such draft" nowhere a caller can see:
    // answering differently would confirm which ids exist.
    expect(without).toBeUndefined()
  })

  test("a token for one draft does not open another", async () => {
    const published = await publishForm(deps, { path: 'contact-us', schema })
    if (!published.ok) throw new Error('publish failed')
    const mine = await startDraft(deps, { path: 'contact-us' })
    const theirs = await startDraft(deps, { path: 'contact-us' })
    if (mine === undefined || theirs === undefined) throw new Error('start failed')
    await saveDraft(deps, {
      path: 'contact-us',
      draftId: theirs.draftId,
      token: theirs.token,
      data: { email: 'theirs@b.ch' },
    })

    const crossed = await resumeDraft(deps, {
      path: 'contact-us',
      draftId: theirs.draftId,
      token: mine.token,
    })

    // A token that opened any draft would make one leaked token a key to all
    // of them, which is the same hole wearing a signature.
    expect(crossed).toBeUndefined()
  })
})

describe('drafts', () => {
  test('an autosaved draft comes back bound to the version it was written under', async () => {
    const published = await publishForm(deps, { path: 'contact-us', schema })
    if (!published.ok) throw new Error('publish failed')

    const started = await startDraft(deps, { path: 'contact-us' })
    if (started === undefined) throw new Error('start failed')
    await saveDraft(deps, { ...started, path: 'contact-us', data: { email: 'wip@b.ch' } })
    const resumed = await resumeDraft(deps, { ...started, path: 'contact-us' })

    expect(resumed).toMatchObject({
      outcome: 'resumed',
      data: { email: 'wip@b.ch' },
      version: 1,
    })
  })

  test('a compatible republish rebinds the draft silently', async () => {
    const v1 = await publishForm(deps, { path: 'contact-us', schema })
    if (!v1.ok) throw new Error('publish failed')
    const started = await startDraft(deps, { path: 'contact-us' })
    if (started === undefined) throw new Error('start failed')
    await saveDraft(deps, { ...started, path: 'contact-us', data: { email: 'wip@b.ch' } })

    // Adding an optional field is compatible.
    const evolved = {
      ...schema,
      model: { fields: [...schema.model.fields, { key: 'note', type: 'text' }] },
    } as typeof schema
    await publishForm(deps, { path: 'contact-us', schema: evolved })

    const resumed = await resumeDraft(deps, { ...started, path: 'contact-us' })

    expect(resumed).toMatchObject({ outcome: 'resumed', version: 2 })
    expect(resumed && 'migration' in resumed ? resumed.migration : undefined).toBeUndefined()
  })

  test('a lossy republish rebinds with a migration report, orphaning rather than deleting', async () => {
    const v1 = await publishForm(deps, { path: 'contact-us', schema })
    if (!v1.ok) throw new Error('publish failed')
    const started = await startDraft(deps, { path: 'contact-us' })
    if (started === undefined) throw new Error('start failed')
    await saveDraft(deps, {
      ...started,
      path: 'contact-us',
      data: { email: 'wip@b.ch', country: 'CH' },
    })

    // Dropping country is lossy.
    const evolved = {
      ...schema,
      model: { fields: schema.model.fields.filter((f) => f.key !== 'country' && f.key !== 'canton') },
      logic: { rules: [{ target: 'total', kind: 'computed', cel: 'price * qty' }] },
    } as typeof schema
    await publishForm(deps, { path: 'contact-us', schema: evolved })

    const resumed = await resumeDraft(deps, { ...started, path: 'contact-us' })

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
    const started = await startDraft(deps, { path: 'contact-us' })
    if (started === undefined) throw new Error('start failed')
    await saveDraft(deps, { ...started, path: 'contact-us', data: { email: 'wip@b.ch' } })

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

    const resumed = await resumeDraft(deps, { ...started, path: 'contact-us' })

    expect(resumed).toMatchObject({ outcome: 'readOnly', version: 1 })
  })

  test('an unknown draft or form is undefined', async () => {
    expect(
      await resumeDraft(deps, { path: 'ghost', draftId: 'x', token: 'anything' }),
    ).toBeUndefined()
    await publishForm(deps, { path: 'contact-us', schema })
    // An id that was never minted has no valid token either, so this is the
    // same answer a wrong token gets -- deliberately, because telling them
    // apart would confirm which ids exist.
    expect(
      await resumeDraft(deps, { path: 'contact-us', draftId: 'nope', token: 'anything' }),
    ).toBeUndefined()
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

describe('the side the server replays as', () => {
  /*
   * `runsOn` exists so a check that can only run in one place can say so
   * ([0043](../../../docs/decisions/0043-runs-on.md)) — a uniqueness check needs
   * the database, a debounced hint needs the keyboard.
   *
   * The engine honours it. The server never told the engine which side it was,
   * so the replay ran as a CLIENT: a `runsOn: "server"` rule was skipped in the
   * one place it was meant to run, and a `runsOn: "client"` rule ran in the one
   * place it was meant not to. Both halves of the feature were backwards, in the
   * product, with nothing reporting it.
   */
  const withRule = (runsOn: 'server' | 'client'): FormSchema =>
    ({
      specVersion: '3',
      id: 'contact-us',
      title: 'Contact us',
      model: { fields: [{ key: 'email', type: 'text', label: 'Email' }] },
      logic: {
        rules: [
          { target: 'email', kind: 'validate', cel: 'false', code: 'refused', runsOn },
        ],
      },
    }) as unknown as FormSchema

  test('runs a server-only validation rule, which is what runsOn is for', async () => {
    const published = await publishForm(deps, { path: 'contact-us', schema: withRule('server') })
    if (!published.ok) throw new Error('publish failed')

    const outcome = await createSubmission(deps, {
      path: 'contact-us',
      declaredSchemaHash: published.schemaHash,
      actor: 'authenticated',
      data: { email: 'a@b.ch' },
    })

    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(JSON.stringify(outcome)).toMatch(/refused/)
  })

  test('and does not run a client-only one, which would be a second opinion', async () => {
    // A debounced hint, or anything else the browser owns. Running it here would
    // refuse a submission the browser had accepted, for a rule whose author said
    // where it belongs.
    const published = await publishForm(deps, { path: 'contact-us', schema: withRule('client') })
    if (!published.ok) throw new Error('publish failed')

    const outcome = await createSubmission(deps, {
      path: 'contact-us',
      declaredSchemaHash: published.schemaHash,
      actor: 'authenticated',
      data: { email: 'a@b.ch' },
    })

    expect(outcome.ok).toBe(true)
  })
})

describe('two people editing one form', () => {
  /*
   * form.io calls it collision control. The mechanism was already here and
   * pointed the other way: a SUBMISSION declares the version it was rendered
   * against, and a stale one is refused with `version_changed` carrying the
   * current schema, so the client can re-render rather than guess.
   *
   * Publishing declared nothing. Two editors open the same form, both press
   * publish, and the second silently wins — no error, no diff, no sign that
   * anybody else had it open. The first editor's work is not lost, because a
   * published version is immutable and theirs is still version 4
   * ([0025](../../../docs/decisions/0025-immutability-in-the-database.md)) —
   * what is lost is that anyone noticed, and `forms.current_version_id` now
   * points past it.
   *
   * **Declaring is optional, and that is deliberate.** A script, the CLI and an
   * agent publish a document they composed rather than one they opened, and have
   * nothing to declare; forcing them to read the current version first would make
   * every one of them do a round trip to satisfy a rule about editors. What
   * declares is the thing that OPENED a version: the builder.
   */
  const other: FormSchema = {
    ...schema,
    title: 'Contact, edited by somebody else',
  }

  const publishedHash = async (): Promise<string> => {
    const outcome = await publishForm(deps, { path: 'contact-us', schema })
    if (!outcome.ok) throw new Error('the fixture did not publish')
    return outcome.schemaHash
  }

  test('a publish that declares nothing still publishes, as a script does', async () => {
    await publishedHash()

    const outcome = await publishForm(deps, { path: 'contact-us', schema: other })

    expect(outcome.ok).toBe(true)
  })

  test('a publish that declares the version it opened is accepted', async () => {
    const basedOn = await publishedHash()

    const outcome = await publishForm(deps, {
      path: 'contact-us',
      schema: other,
      basedOnSchemaHash: basedOn,
    })

    expect(outcome.ok).toBe(true)
  })

  test('and one that declares a version somebody has since replaced is refused', async () => {
    const basedOn = await publishedHash()
    // Somebody else publishes while the first editor is still editing.
    await publishForm(deps, { path: 'contact-us', schema: other })

    const outcome = await publishForm(deps, {
      path: 'contact-us',
      schema: { ...schema, title: 'Contact, edited by the first person' },
      basedOnSchemaHash: basedOn,
    })

    expect(outcome).toMatchObject({ ok: false, kind: 'version_changed' })
  })

  test('and the refusal carries the current version, so the editor can show the difference', async () => {
    // The same body the submission path's 409 carries, for the same reason: a
    // refusal that only says no makes the client fetch and guess what changed.
    const basedOn = await publishedHash()
    await publishForm(deps, { path: 'contact-us', schema: other })

    const outcome = await publishForm(deps, {
      path: 'contact-us',
      schema,
      basedOnSchemaHash: basedOn,
    })

    expect(outcome.ok).toBe(false)
    if (outcome.ok || outcome.kind !== 'version_changed') throw new Error('wrong refusal')
    expect(outcome.current?.schema).toMatchObject({ title: 'Contact, edited by somebody else' })
    expect(outcome.current?.version).toBe(2)
  })

  test('republishing the identical document is still idempotent, declared or not', async () => {
    /*
     * The order these two checks happen in is the whole of this case. If the
     * stale-base refusal came first, an editor whose document already MATCHES
     * what is published would be told to resolve a conflict with themselves —
     * somebody else wrote exactly what they were going to write, there is
     * nothing to merge, and "deploy again" must never manufacture a version.
     */
    const basedOn = await publishedHash()
    await publishForm(deps, { path: 'contact-us', schema: other })

    const outcome = await publishForm(deps, {
      path: 'contact-us',
      schema: other,
      basedOnSchemaHash: basedOn,
    })

    expect(outcome).toMatchObject({ ok: true, version: 2 })
  })

  test('a first publish declaring a base is refused, because there was nothing to open', async () => {
    // An editor that declares a version of a form which has none is an editor
    // working from something this deployment never published.
    const outcome = await publishForm(deps, {
      path: 'brand-new',
      schema,
      basedOnSchemaHash: 'sha256-of-a-form-that-is-not-here',
    })

    expect(outcome).toMatchObject({ ok: false, kind: 'version_changed' })
  })
})

describe('a document naming a list this deployment cannot resolve', () => {
  /*
   * `SAFETY-ANALYSIS.md` A7 states this as a constraint — *"at publish time a
   * document naming a source the deployment has never configured is refused
   * outright, so a form cannot be frozen with a list nobody can resolve"* —
   * and nothing failed if it stopped being true. [0077]'s *Verified by* names
   * the schema-validation cases and the submission-time membership cases, and
   * this branch was in neither.
   *
   * It matters because a published version is frozen forever: the form's
   * select would render a message instead of a chooser, for as long as that
   * version exists, with nothing having said so at the only moment anybody
   * could have acted on it.
   */
  const sourced: FormSchema = {
    specVersion: '2',
    id: 'sourced',
    title: 'Sourced',
    model: { fields: [{ key: 'canton', type: 'select', optionsSource: 'cantons' }] },
  }

  test('is refused, and names the list so an operator can compare configurations', async () => {
    const outcome = await publishForm({ ...deps, optionsSources: {} }, {
      path: 'needs-cantons',
      schema: sourced,
    })

    expect(outcome).toMatchObject({ ok: false, kind: 'unknown_options_source', sources: ['cantons'] })
  })

  test('and publishes once the deployment offers it', async () => {
    const outcome = await publishForm({ ...deps, optionsSources: { cantons: {} } }, {
      path: 'needs-cantons',
      schema: sourced,
    })

    expect(outcome.ok).toBe(true)
  })

  test('while a deployment that configures no sources at all publishes it unchecked', async () => {
    // `optionsSources` absent means this deployment does not resolve lists,
    // which is not the same as "this list does not exist" — the alternative
    // would make every form naming a source unpublishable on a default
    // install, including one whose host supplies the list client-side.
    const outcome = await publishForm(deps, { path: 'unchecked', schema: sourced })

    expect(outcome.ok).toBe(true)
  })
})

describe('republishing a document this form has already had', () => {
  /*
   * `UNIQUE (form_id, schema_hash)` is what makes republishing the CURRENT
   * document a no-op rather than a version factory, and it refuses an OLDER
   * one just as firmly. Reverting by republishing yesterday's document is a
   * reasonable thing to try, and before this branch existed the insert raised
   * and the route answered **500**.
   *
   * Asserted here and not only against real PostgreSQL, because the refusal is
   * a decision this layer makes — a published version is immutable and cannot
   * be published twice ([0025]) — rather than a constraint it discovers. A
   * branch only the integration suite reaches is a branch a later tidy-up
   * deletes.
   */
  test('names the version it already is, rather than failing at the insert', async () => {
    const first = await publishForm(deps, { path: 'revert-me', schema })
    await publishForm(deps, { path: 'revert-me', schema: { ...schema, title: 'A bad edit' } })

    // Putting the original back, which is what undoing looks like.
    const outcome = await publishForm(deps, { path: 'revert-me', schema })

    expect(outcome).toMatchObject({ ok: false, kind: 'already_published', version: 1 })
    expect(first.ok).toBe(true)
  })

  test('while the current document is idempotent, which is what makes that refusal safe', async () => {
    // The distinction: "deploy again" must never manufacture a version, and
    // must never start failing either.
    await publishForm(deps, { path: 'deploy-twice', schema })

    const outcome = await publishForm(deps, { path: 'deploy-twice', schema })

    expect(outcome).toMatchObject({ ok: true, version: 1 })
  })
})
