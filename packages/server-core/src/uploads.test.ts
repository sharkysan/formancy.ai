import { beforeEach, describe, expect, test } from 'vitest'
import { collectAbandonedFiles, filesToClaim, offerUpload } from './uploads.js'
import { createMemoryStorage } from './testing/memory-storage.js'
import type { FileRecord, FormRecord, Storage } from './ports.js'
import type { FormSchema } from '@formancy/spec'

/**
 * The file lifecycle, which is three states and one rule.
 *
 * A file is **offered** when somebody asks where to put one, **stored** once
 * the bytes arrive, and **claimed** when a submission that references it is
 * accepted. The rule: a file that is never claimed is rubbish, and rubbish
 * that is never collected is a disk filling up in a way nobody is watching.
 *
 * The claim happens inside the submission's own transaction, so a submission
 * exists if and only if the files it names are claimed. Anything looser and a
 * rolled-back submission leaves files claimed against nothing, or an accepted
 * one references files the collector is about to delete.
 */
const NOW = new Date('2026-09-24T12:00:00.000Z')

const schema: FormSchema = {
  specVersion: '2',
  id: 'claim',
  title: 'Claim',
  model: {
    fields: [
      { key: 'reference', type: 'text', label: 'Reference' },
      { key: 'evidence', type: 'file', label: 'Evidence', maxFileSize: 1_000_000 },
      {
        key: 'people',
        type: 'repeater',
        label: 'People',
        fields: [{ key: 'passport', type: 'file', label: 'Passport' }],
      },
    ],
  },
}

const form: FormRecord = {
  id: 'form1',
  path: 'claim',
  currentVersionId: null,
  accessSubmit: 'public',
  allowedOrigins: null,
}

const file = (over: Partial<FileRecord> = {}): FileRecord => ({
  id: 'f1',
  formId: 'form1',
  name: 'report.pdf',
  size: 1024,
  contentType: 'application/pdf',
  storageKey: 'k/f1',
  state: 'stored',
  createdAt: NOW.toISOString(),
  submissionId: null,
  ...over,
})

describe('offerUpload', () => {
  let storage: Storage

  beforeEach(async () => {
    storage = createMemoryStorage()
    await storage.createForm(form)
  })

  const offer = (over: Record<string, unknown> = {}) =>
    offerUpload(
      { storage, now: () => NOW, newId: () => 'f1' },
      {
        schema,
        form,
        actor: 'anonymous',
        origin: undefined,
        field: 'evidence',
        name: 'report.pdf',
        size: 1024,
        contentType: 'application/pdf',
        ...over,
      },
    )

  test('records the file as offered, before any bytes exist', async () => {
    const outcome = await offer()

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    // The row comes first so the collector knows about a file even if the
    // upload dies halfway: an orphan on disk with no row is one nothing will
    // ever look for.
    expect((await storage.getFile('f1'))?.state).toBe('offered')
  })

  test('refuses a field that is not a file field', async () => {
    const outcome = await offer({ field: 'reference' })

    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.reason).toBe('not_a_file_field')
  })

  test('refuses a field that does not exist', async () => {
    expect((await offer({ field: 'ghost' })).ok).toBe(false)
  })

  test('finds a file field inside a repeater', async () => {
    // `people[].passport` is a file field like any other; the offer is per
    // FIELD, not per instance, because the row may not exist yet.
    expect((await offer({ field: 'people[].passport' })).ok).toBe(true)
  })

  test('refuses a file larger than the field allows, before it is uploaded', async () => {
    const outcome = await offer({ size: 2_000_000 })

    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.reason).toBe('too_large')
  })

  test('refuses a content type the field does not accept', async () => {
    const narrow: FormSchema = {
      ...schema,
      model: {
        fields: [{ key: 'evidence', type: 'file', label: 'Evidence', accept: ['image/*'] }],
      },
    }

    const outcome = await offerUpload(
      { storage, now: () => NOW, newId: () => 'f1' },
      {
        schema: narrow,
        form,
        actor: 'anonymous',
        origin: undefined,
        field: 'evidence',
        name: 'report.pdf',
        size: 10,
        contentType: 'application/pdf',
      },
    )

    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.reason).toBe('not_accepted')
  })

  test('the storage key is not the name somebody uploaded', async () => {
    const outcome = await offer({ name: '../../etc/passwd' })

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    // A key built from a submitted filename is a path traversal waiting for
    // somebody to try it, and the name is kept only to show the reader later.
    expect(outcome.file.storageKey).not.toContain('..')
    expect(outcome.file.storageKey).toContain('f1')
    expect(outcome.file.name).toBe('../../etc/passwd')
  })
})

describe('filesToClaim', () => {
  let storage: Storage

  beforeEach(async () => {
    storage = createMemoryStorage()
    await storage.createForm(form)
  })

  test('claims every file the submission references', async () => {
    await storage.insertFile(file({ id: 'a' }))
    await storage.insertFile(file({ id: 'b', storageKey: 'k/b' }))

    const outcome = await filesToClaim(storage, {
      schema,
      formId: 'form1',
      data: { evidence: [{ id: 'a' }], people: [{ passport: [{ id: 'b' }] }] },
    })

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    // Named, not yet claimed: insertSubmission does that in the same call it
    // stores the submission, so one COMMIT decides both.
    expect([...outcome.ids].sort()).toEqual(['a', 'b'])
    expect((await storage.getFile('a'))?.state).toBe('stored')
  })

  test('refuses a file that was never uploaded', async () => {
    const outcome = await filesToClaim(storage, {
      schema,
      formId: 'form1',
      data: { evidence: [{ id: 'ghost' }] },
    })

    // The submission names something that does not exist, which is either a
    // bug or somebody guessing ids. Either way it is not a submission.
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.unknown).toEqual(['ghost'])
  })

  test('refuses a file belonging to another form', async () => {
    await storage.insertFile(file({ id: 'a', formId: 'other' }))

    const outcome = await filesToClaim(storage, {
      schema,
      formId: 'form1',
      data: { evidence: [{ id: 'a' }] },
    })

    // Otherwise an id from a form you may submit to lets you attach a file
    // from one you may not.
    expect(outcome.ok).toBe(false)
  })

  test('refuses a file already claimed by another submission', async () => {
    await storage.insertFile(file({ id: 'a', state: 'claimed', submissionId: 'earlier' }))

    const outcome = await filesToClaim(storage, {
      schema,
      formId: 'form1',
      data: { evidence: [{ id: 'a' }] },
    })

    // One file, one submission. Sharing would make deleting a submission
    // either leak bytes or break a different submission.
    expect(outcome.ok).toBe(false)
  })

  test('refuses a file whose bytes never arrived', async () => {
    await storage.insertFile(file({ id: 'a', state: 'offered' }))

    expect(
      (await filesToClaim(storage, { schema, formId: 'form1', data: { evidence: [{ id: 'a' }] } }))
        .ok,
    ).toBe(false)
  })

  test('a submission with no files claims nothing and is fine', async () => {
    expect(
      (await filesToClaim(storage, { schema, formId: 'form1', data: { reference: 'x' } })).ok,
    ).toBe(
      true,
    )
  })

  test('ignores values that merely look like file references', async () => {
    // A text answer of `{ id: 'a' }` is not an attachment. Only the paths the
    // model says are file fields are read, which is also what stops a client
    // hiding a reference from the claim by leaving a property out of it.
    const outcome = await filesToClaim(storage, {
      schema,
      formId: 'form1',
      data: { reference: { id: 'a' } },
    })

    expect(outcome.ok).toBe(true)
  })
})

describe('collectAbandonedFiles', () => {
  let storage: Storage

  beforeEach(() => {
    storage = createMemoryStorage()
  })

  const hoursAgo = (hours: number): string =>
    new Date(NOW.getTime() - hours * 3_600_000).toISOString()

  test('collects a file nobody ever claimed', async () => {
    await storage.insertFile(file({ id: 'a', createdAt: hoursAgo(30) }))

    const collected = await collectAbandonedFiles(storage, NOW, 24)

    expect(collected.map((entry) => entry.id)).toEqual(['a'])
  })

  test('leaves a recent one alone, because the submission may still be open', async () => {
    await storage.insertFile(file({ id: 'a', createdAt: hoursAgo(2) }))

    expect(await collectAbandonedFiles(storage, NOW, 24)).toEqual([])
  })

  test('never collects a claimed file, however old', async () => {
    await storage.insertFile(
      file({ id: 'a', createdAt: hoursAgo(10_000), state: 'claimed', submissionId: 's1' }),
    )

    // A claimed file belongs to a submission, and a submission is evidence
    // somebody sent something. Age is not a reason to delete it.
    expect(await collectAbandonedFiles(storage, NOW, 24)).toEqual([])
  })

  test('collects an offer whose bytes never arrived', async () => {
    await storage.insertFile(file({ id: 'a', state: 'offered', createdAt: hoursAgo(30) }))

    expect((await collectAbandonedFiles(storage, NOW, 24)).map((entry) => entry.id)).toEqual(['a'])
  })

  test('returns the rows rather than deleting the bytes itself', async () => {
    await storage.insertFile(file({ id: 'a', createdAt: hoursAgo(30) }))

    const collected = await collectAbandonedFiles(storage, NOW, 24)

    // This package has no filesystem and no object store. It says what is
    // rubbish; the host deletes it and then removes the rows.
    expect(collected[0]?.storageKey).toBe('k/f1')
    expect(await storage.getFile('a')).toBeDefined()
  })
})
