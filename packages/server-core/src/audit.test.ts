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
    expect(await d.storage.listAudit(10)).toHaveLength(0)
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
