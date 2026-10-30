import { beforeEach, describe, expect, test } from 'vitest'
import type { FormSchema } from '@formancy/spec'
import { listSubmissionPage } from './submission-pages.js'
import { publishForm } from './publishing.js'
import type { ServerDeps } from './deps.js'
import { createMemoryStorage } from './testing/memory-storage.js'

/**
 * A form's submissions a page at a time (0222).
 *
 * The listing answered every submission of a form in one reply, so a form with many responses was
 * one reply of all of them, held in the server's memory and the admin's. A page is bounded, and the
 * next is asked for by where the last one ended rather than by an offset, so a response stored
 * while somebody pages is never counted twice or skipped.
 */
const schema: FormSchema = {
  specVersion: '1',
  id: 'contact',
  title: 'Contact',
  model: { fields: [{ key: 'email', type: 'text' }] },
}

let deps: ServerDeps
let versionId = ''
let formId = ''

beforeEach(async () => {
  let counter = 0
  deps = {
    storage: createMemoryStorage(),
    newId: () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`,
    draftSecret: 'a-test-signing-key-of-adequate-length',
    capabilities: { now: () => 1_726_000_000_000, today: () => '2026-09-19', random: () => 0.5 },
    nowIso: () => '2026-09-19T12:00:00.000Z',
  }
  const published = await publishForm(deps, { path: 'contact-us', schema })
  if (!published.ok) throw new Error('publish failed')
  versionId = published.versionId
  formId = (await deps.storage.getFormByPath('contact-us'))!.id
})

/** A response stored at `at`, with an id that sorts as `n` does. */
async function store(n: number, at: string): Promise<void> {
  await deps.storage.insertSubmission({
    id: `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    formId,
    formVersionId: versionId,
    data: { email: `${String(n)}@example.ch` },
    submittedAt: at,
  })
}

/** Every page, from the first, as the emails each held. */
async function pages(limit: number): Promise<string[][]> {
  const seen: string[][] = []
  let after: string | undefined
  for (;;) {
    const page = await listSubmissionPage(deps, 'contact-us', { limit, after })
    if (page === undefined || page.kind !== 'page') throw new Error(`no page: ${JSON.stringify(page)}`)
    seen.push(page.submissions.map((submission) => (submission.data as { email: string }).email))
    if (page.next === null) return seen
    // A cursor the listing ignores would hand back the first page for ever: fail, not hang.
    if (seen.length > 100) throw new Error('the pages never ended')
    after = page.next
  }
}

describe('a page of submissions', () => {
  test('holds at most the limit, newest first, and the next is asked for from where it ended', async () => {
    for (let n = 1; n <= 5; n++) await store(n, `2026-09-19T12:00:0${String(n)}.000Z`)

    expect(await pages(2)).toEqual([
      ['5@example.ch', '4@example.ch'],
      ['3@example.ch', '2@example.ch'],
      ['1@example.ch'],
    ])
  })

  // Two responses stored in the same millisecond are ordered by their ids, so neither is lost at
  // a page's edge and neither is listed twice.
  test('splits responses stored at the same moment by their ids, listing each once', async () => {
    for (let n = 1; n <= 4; n++) await store(n, '2026-09-19T12:00:00.000Z')

    expect(await pages(3)).toEqual([['4@example.ch', '3@example.ch', '2@example.ch'], ['1@example.ch']])
  })

  // An offset would move every row down by one when a response arrives, and the next page would
  // list again the last row of the one before.
  test('is not shifted by a response stored while somebody pages', async () => {
    for (let n = 1; n <= 4; n++) await store(n, `2026-09-19T12:00:0${String(n)}.000Z`)
    const first = await listSubmissionPage(deps, 'contact-us', { limit: 2 })
    if (first?.kind !== 'page' || first.next === null) throw new Error('no first page')

    await store(9, '2026-09-19T12:00:09.000Z')
    const second = await listSubmissionPage(deps, 'contact-us', { limit: 2, after: first.next })

    expect(second?.kind === 'page' ? second.submissions.map((s) => (s.data as { email: string }).email) : second).toEqual([
      '2@example.ch',
      '1@example.ch',
    ])
  })

  test('says which version each response answered', async () => {
    await store(1, '2026-09-19T12:00:01.000Z')
    const page = await listSubmissionPage(deps, 'contact-us', { limit: 10 })

    expect(page?.kind === 'page' ? page.submissions.map((s) => s.version) : page).toEqual([1])
  })

  test('is empty, with no next, for a form nobody has answered', async () => {
    expect(await listSubmissionPage(deps, 'contact-us', { limit: 10 })).toEqual({ kind: 'page', submissions: [], next: null })
  })

  test('is undefined for a form there is none of', async () => {
    expect(await listSubmissionPage(deps, 'ghost', { limit: 10 })).toBeUndefined()
  })

  // A cursor arrives in a URL. One that names no place in the list cannot be read as the start,
  // which would list again every response the person already has.
  test.each([
    '',
    'not-a-cursor',
    '2026-09-19T12:00:00.000Z_nope',
    'yesterday_10000000-0000-4000-8000-000000000001',
    '2026-09-19T12:00:00.000Z10000000-0000-4000-8000-000000000001',
  ])(
    'refuses a cursor that names no place in the list: %j',
    async (after) => {
      expect(await listSubmissionPage(deps, 'contact-us', { limit: 10, after })).toEqual({ kind: 'bad_cursor' })
    },
  )

  // The point of a page is that it is bounded: a limit asked of a million is a thousand.
  test('holds between 1 and 1000, whatever is asked', async () => {
    for (let n = 1; n <= 1001; n++) await store(n, '2026-09-19T12:00:00.000Z')

    const none = await listSubmissionPage(deps, 'contact-us', { limit: 0 })
    expect(none?.kind === 'page' ? none.submissions : none).toHaveLength(1)
    const many = await listSubmissionPage(deps, 'contact-us', { limit: 1_000_000 })
    expect(many?.kind === 'page' ? [many.submissions.length, many.next !== null] : many).toEqual([1000, true])
  })
})
