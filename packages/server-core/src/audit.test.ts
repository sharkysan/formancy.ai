import { describe, expect, test } from 'vitest'
import { AUDIT_ACTIONS, auditedBy } from './audit.js'
import type { AuditAction } from './audit.js'
import { createMemoryStorage } from './testing/memory-storage.js'
import { createSubmission, publishForm, setFormAccess } from './use-cases.js'
import type { ServerDeps } from './index.js'

/**
 * What the log records, and what it must never contain.
 *
 * The second half is the one worth tests. An audit log is read by more people,
 * kept longer and exported more freely than the data it describes, so a
 * submission's answers leaking into it makes every one of those a second copy
 * of the thing being protected. It is the sort of leak nobody notices, because
 * the feature works either way.
 */
const SCHEMA = {
  specVersion: '2',
  id: 'survey',
  title: 'Survey',
  model: {
    fields: [
      { key: 'email', type: 'text', label: 'Email', required: true },
      { key: 'salary', type: 'number', label: 'Salary' },
    ],
  },
}

let counter = 0

const deps = (): ServerDeps => ({
  storage: createMemoryStorage(),
  newId: () => `id-${String(++counter)}`,
  nowIso: () => '2026-09-25T10:00:00.000Z',
  capabilities: {
    now: () => 0,
    today: () => '2026-09-25',
    random: () => 0.5,
  },
})

/** A published, publicly submittable form, and the hash a client must declare. */
async function publishedForm(): Promise<{ d: ServerDeps; hash: string }> {
  const d = deps()
  const published = await publishForm(d, { path: 'survey', schema: SCHEMA })
  if (!published.ok) throw new Error('the fixture form did not publish')
  // Through the use-case, which takes a path; the port underneath takes a
  // form id and is not the thing being tested here.
  await setFormAccess(d, { path: 'survey', submit: 'public' })
  return { d, hash: published.schemaHash }
}

describe('the vocabulary', () => {
  test('is closed, so two routes cannot spell the same event differently', () => {
    // A `string` here would let a new route invent its own name, and an audit
    // log where one event is called two things is one nobody can query.
    const actions: readonly AuditAction[] = AUDIT_ACTIONS
    expect(new Set(actions).size).toBe(actions.length)
  })

  test('covers reads, not only writes', () => {
    // The whole point. A log of mutations says who changed the form; it does
    // not say who read four thousand people's answers.
    expect(AUDIT_ACTIONS).toContain('submission.read')
    expect(AUDIT_ACTIONS).toContain('submission.exported')
  })

  test('covers failed logins, not only successful ones', () => {
    // A hundred failures then one success is the shape of an attack, and
    // recording only the success hides it.
    expect(AUDIT_ACTIONS).toContain('auth.login.failed')
  })
})

describe('auditedBy', () => {
  test('spreads an actor into the two fields that go together', () => {
    const entry = auditedBy({ kind: 'user', id: 'u1', role: 'admin' }, { action: 'form.published' })

    expect(entry).toMatchObject({ actorKind: 'user', actorId: 'u1' })
  })

  test('leaves them both off when nobody was signed in', () => {
    // A real answer rather than a gap: the form was open, and an anonymous
    // submission has no actor to name.
    const entry = auditedBy(undefined, { action: 'submission.created' })

    expect(entry).not.toHaveProperty('actorKind')
    expect(entry).not.toHaveProperty('actorId')
  })
})

describe('a submission', () => {
  test('writes its audit row in the same call as the submission', async () => {
    const { d, hash } = await publishedForm()

    await createSubmission(d, {
      path: 'survey',
      declaredSchemaHash: hash,
      data: { email: 'ada@example.ch', salary: 120000 },
      actor: 'anonymous',
    })

    const [entry] = await d.storage.listAudit(10)
    expect(entry?.action).toBe('submission.created')
    expect(entry?.subject).toBe('survey')
  })

  test('and none at all when the submission is refused', async () => {
    const { d, hash } = await publishedForm()

    // `email` is required. Nothing was stored, so nothing may say it was.
    const outcome = await createSubmission(d, {
      path: 'survey',
      declaredSchemaHash: hash,
      data: { salary: 120000 },
      actor: 'anonymous',
    })

    expect(outcome.ok).toBe(false)
    // Scoped to the submission: the fixture's own publish is audited too, now
    // that a publish writes its row inside its transaction.
    const created = (await d.storage.listAudit(50)).filter(
      (entry) => entry.action === 'submission.created',
    )
    expect(created).toHaveLength(0)
  })

  test('records that nobody was signed in, rather than inventing an actor', async () => {
    const { d, hash } = await publishedForm()

    await createSubmission(d, {
      path: 'survey',
      declaredSchemaHash: hash,
      data: { email: 'ada@example.ch' },
      actor: 'anonymous',
    })

    const [entry] = await d.storage.listAudit(10)
    expect(entry?.actorId).toBeUndefined()
    expect(entry?.detail).toMatchObject({ authenticated: false })
  })

  test('NEVER carries the answers', async () => {
    const { d, hash } = await publishedForm()

    await createSubmission(d, {
      path: 'survey',
      declaredSchemaHash: hash,
      data: { email: 'ada@example.ch', salary: 120000 },
      actor: 'anonymous',
    })

    const [entry] = await d.storage.listAudit(10)
    const written = JSON.stringify(entry)

    // The test that matters, and the one that keeps mattering: `detail` is
    // identifiers and counts. A convenience field added later that happened
    // to include the data would make the audit log a second copy of it.
    expect(written).not.toContain('ada@example.ch')
    expect(written).not.toContain('120000')
    // What it does carry: enough to find the submission and know which schema
    // answered it.
    expect(entry?.detail).toMatchObject({ version: 1 })
    expect(entry?.detail?.['submissionId']).toBeTruthy()
  })
})

describe('the log', () => {
  test('comes back newest first', async () => {
    const { d, hash } = await publishedForm()

    await d.storage.recordAudit({ id: 'a1', at: '2026-09-25T09:00:00.000Z', action: 'auth.login' })
    await d.storage.recordAudit({ id: 'a2', at: '2026-09-25T11:00:00.000Z', action: 'auth.login' })

    const entries = await d.storage.listAudit(10)
    expect(entries[0]?.id).toBe('a2')
  })

  test('has no update and no delete on the port for anything to call', () => {
    const storage = createMemoryStorage()

    // Append-only is a property of the contract, not a habit. The database
    // enforces it with a trigger as well.
    expect(Object.keys(storage)).not.toContain('updateAudit')
    expect(Object.keys(storage)).not.toContain('deleteAudit')
  })
})

/**
 * A publish is one commit.
 *
 * It used to be three storage calls, and the middle failure is the one that
 * hurts: a form row whose pointer was never set resolves to nothing, so the
 * form is in the list, answers its URL, and has no schema to render.
 */
describe('publishing', () => {
  test('writes its audit row, with the actor who did it', async () => {
    const d = deps()

    await publishForm(d, {
      path: 'survey',
      schema: SCHEMA,
      actor: { kind: 'user', id: 'u-ada', role: 'admin' },
    })

    const [entry] = await d.storage.listAudit(10)
    expect(entry).toMatchObject({
      action: 'form.published',
      subject: 'survey',
      actorKind: 'user',
      actorId: 'u-ada',
    })
  })

  test('leaves nothing behind when a step fails', async () => {
    const d = deps()
    // The failure that motivated the transaction: the version lands and the
    // pointer never does.
    d.storage.publishVersion = () => Promise.reject(new Error('lost the connection'))

    await expect(publishForm(d, { path: 'survey', schema: SCHEMA })).rejects.toThrow()

    // No form, no version, no audit row claiming any of it happened.
    expect(await d.storage.getFormByPath('survey')).toBeUndefined()
    expect(await d.storage.listAudit(10)).toHaveLength(0)
  })

  test('a republish of the same schema is not a new version, and not a new row', async () => {
    const d = deps()
    await publishForm(d, { path: 'survey', schema: SCHEMA })
    const before = (await d.storage.listAudit(50)).length

    const again = await publishForm(d, { path: 'survey', schema: SCHEMA })

    // Nothing changed, so nothing is recorded as having changed. An audit log
    // full of no-op publishes is one nobody reads.
    expect(again).toMatchObject({ ok: true, version: 1 })
    expect(await d.storage.listAudit(50)).toHaveLength(before)
  })

  test('a second, different schema publishes a version 2 and records it', async () => {
    const d = deps()
    await publishForm(d, { path: 'survey', schema: SCHEMA })

    await publishForm(d, {
      path: 'survey',
      schema: {
        ...SCHEMA,
        model: { fields: [...SCHEMA.model.fields, { key: 'note', type: 'text', label: 'Note' }] },
      },
    })

    const [entry] = await d.storage.listAudit(10)
    expect(entry?.detail).toMatchObject({ version: 2 })
  })

  test('the form points at the version it just published', async () => {
    const d = deps()

    const published = await publishForm(d, { path: 'survey', schema: SCHEMA })
    if (!published.ok) throw new Error('did not publish')

    // The property the three calls could break: a form whose pointer is null
    // is present in the list and 404s when opened.
    const form = await d.storage.getFormByPath('survey')
    expect(form?.currentVersionId).toBe(published.versionId)
  })
})
