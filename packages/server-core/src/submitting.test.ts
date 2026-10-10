import { beforeEach, describe, expect, test } from 'vitest'
import type { FormSchema } from '@formancy/spec'
import { createSubmission, formToFill } from './submitting.js'
import { publishForm } from './publishing.js'
import { resumeDraft, saveDraft, setFormAccess, startDraft } from './use-cases.js'
import type { ServerDeps } from './deps.js'
import { createMemoryStorage } from './testing/memory-storage.js'

/**
 * A response is stored once, under the id it was handed with its form
 * ([0169](../../../docs/decisions/0169-a-response-is-stored-once.md)).
 *
 * What the token is for, and what it is not: it does not stop a script, which reads the form
 * and gets one like anybody else, and it does not bind the version, which the schema hash
 * already does. It stops one response being stored twice — a retry after an answer that never
 * arrived, or an exact replay where the challenge is off — each of which was a second
 * submission, with its own id and its own webhook, that nothing told apart from a second
 * respondent.
 */
const schema: FormSchema = {
  specVersion: '1',
  id: 'contact',
  title: 'Contact',
  model: {
    fields: [
      { key: 'email', type: 'text', required: true },
      { key: 'note', type: 'text' },
    ],
  },
}

let deps: ServerDeps
let now = '2026-10-10T09:00:00.000Z'
beforeEach(() => {
  let counter = 0
  now = '2026-10-10T09:00:00.000Z'
  deps = {
    storage: createMemoryStorage(),
    newId: () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`,
    draftSecret: 'a-test-signing-key-of-adequate-length',
    capabilities: { now: () => 1_726_000_000_000, today: () => '2026-10-10', random: () => 0.5 },
    nowIso: () => now,
  }
})

/** A public form, as the tests below need one: published and opened. */
async function openForm(path = 'contact-us', document: FormSchema = schema): Promise<string> {
  const published = await publishForm(deps, { path, schema: document })
  if (!published.ok) throw new Error('publish failed')
  await setFormAccess(deps, { path, submit: 'public' })
  return published.schemaHash
}

async function handedOut(path = 'contact-us'): Promise<string> {
  const form = await formToFill(deps, path)
  if (form === undefined) throw new Error('no form to fill')
  return form.submissionToken
}

const send = (
  hash: string,
  token: string | undefined,
  data: unknown = { email: 'a@b.ch' },
  extra: { path?: string; actor?: 'anonymous' | 'authenticated' } = {},
): ReturnType<typeof createSubmission> =>
  createSubmission(deps, {
    path: extra.path ?? 'contact-us',
    declaredSchemaHash: hash,
    data,
    actor: extra.actor ?? 'anonymous',
    ...(token === undefined ? {} : { token }),
  })

describe('a response carries the token its form was handed out with', () => {
  test('an anonymous one without it is refused, and nothing is stored', async () => {
    // A host that never sends it would store every retry of a response again, with nothing
    // to say so. Refused with its own kind, so the host is told what it left out rather than
    // that the form is closed.
    const hash = await openForm()

    expect(await send(hash, undefined)).toMatchObject({ ok: false, kind: 'token_required' })
    expect(await deps.storage.listSubmissions()).toHaveLength(0)
  })

  test('the form hands one out per reading, and the response is stored under the id it names', async () => {
    // Two respondents reading the form must not be handed one token: the second would be
    // told their response was already sent. And the stored id is the token's, because the
    // id is what the database refuses twice.
    const hash = await openForm()
    const mine = await handedOut()
    const theirs = await handedOut()
    expect(mine).not.toBe(theirs)

    const outcome = await send(hash, mine)

    expect(outcome).toMatchObject({ ok: true, id: mine.split('.')[0] })
  })

  test('sent twice, it is stored once, and the second is told it was already sent', async () => {
    // The failure this exists for: the answer to the first send never arrives, the page sends
    // again, and two submissions — two ids, two webhooks — reach the operator as two people.
    const hash = await openForm()
    const token = await handedOut()

    const first = await send(hash, token)
    const second = await send(hash, token, { email: 'a@b.ch', note: 'again' })

    expect(first.ok).toBe(true)
    expect(second).toMatchObject({ ok: false, kind: 'token_spent', id: token.split('.')[0] })
    expect(await deps.storage.listSubmissions()).toHaveLength(1)
    const created = (await deps.storage.listAudit(50)).filter((entry) => entry.action === 'submission.created')
    expect(created).toHaveLength(1)
  })

  test('a refused attempt does not spend it', async () => {
    // A respondent told to fix an answer, or that the form changed, and then told their
    // response was already sent when it never was, has lost it.
    const hash = await openForm()
    const token = await handedOut()

    expect(await send(hash, token, {})).toMatchObject({ ok: false, kind: 'invalid' })
    expect(await send('a-stale-hash', token)).toMatchObject({ ok: false, kind: 'version_changed' })
    expect(await send(hash, token)).toMatchObject({ ok: true })
  })

  test("another form's token is refused", async () => {
    // Bound to the form, so a token handed out for one form cannot carry a response into
    // another, and an id cannot be spent on a form that never handed it out.
    const hash = await openForm()
    await openForm('other-form', { ...schema, id: 'other' })
    const elsewhere = await handedOut('other-form')

    expect(await send(hash, elsewhere)).toMatchObject({ ok: false, kind: 'token_invalid' })
    expect(await deps.storage.listSubmissions()).toHaveLength(0)
  })

  test('a token this server did not sign is refused', async () => {
    // The id is in the clear, so without the signature anybody could name an id — another
    // respondent's, read off a draft link — and spend it first.
    const hash = await openForm()
    const genuine = await handedOut()
    const [id] = genuine.split('.')
    const otherKey = { ...deps, draftSecret: 'another-deployments-signing-key-entirely' }
    const foreign = (await formToFill(otherKey, 'contact-us'))!.submissionToken

    for (const token of [`${id!}.${'0'.repeat(64)}`, foreign, 'nonsense', '', `${id!}.`]) {
      expect(await send(hash, token), token).toMatchObject({ ok: false, kind: 'token_invalid' })
    }
    expect(await deps.storage.listSubmissions()).toHaveLength(0)
  })

  test('it does not bind the version: one handed out before a republish submits against the new one', async () => {
    // The schema hash already says which version a response answered. A token that said it
    // too would be a second answer to one question, and the two would disagree exactly where
    // a draft is rebound to a newer version on resume.
    await openForm()
    const token = await handedOut()
    const republished = await publishForm(deps, { path: 'contact-us', schema: { ...schema, title: 'Contact us' } })
    if (!republished.ok) throw new Error('republish failed')

    expect(await send(republished.schemaHash, token)).toMatchObject({ ok: true })
  })

  test('a signed-in submitter may leave it out, and one presented is still checked and spent', async () => {
    // A session or an API key is an identity the challenge already exempts. An integration
    // posting records has no form it was handed; it gets a fresh id, as before. But a token
    // that arrives is never ignored: ignoring a forged one would make it decoration.
    const hash = await openForm()
    expect(await send(hash, undefined, undefined, { actor: 'authenticated' })).toMatchObject({ ok: true })
    expect(await send(hash, 'nonsense', undefined, { actor: 'authenticated' })).toMatchObject({
      ok: false,
      kind: 'token_invalid',
    })
    const token = await handedOut()
    expect(await send(hash, token, undefined, { actor: 'authenticated' })).toMatchObject({ ok: true })
    expect(await send(hash, token, undefined, { actor: 'authenticated' })).toMatchObject({
      ok: false,
      kind: 'token_spent',
    })
  })
})

describe('a draft is one response, however late and however often it is resumed', () => {
  test('starting one hands out its token, and resuming hands back the same one', async () => {
    // A response sent from a draft, whose answer was lost, is sent again after a reload — from
    // the resumed draft. Were that a fresh token, the reload would store it twice.
    await openForm()
    const started = await startDraft(deps, { path: 'contact-us' })
    if (started === undefined) throw new Error('no draft')
    await saveDraft(deps, { path: 'contact-us', draftId: started.draftId, token: started.token, data: { email: 'a@b.ch' } })

    const resumed = await resumeDraft(deps, { path: 'contact-us', draftId: started.draftId, token: started.token })

    expect(started.submissionToken.split('.')[0]).toBe(started.draftId)
    expect(resumed).toMatchObject({ outcome: 'resumed', submissionToken: started.submissionToken })
  })

  test('resumed a month later, it still submits — once', async () => {
    // A draft exists so that somebody can come back; a token that expired would refuse them
    // the day they did. The token sent is the one handed out at the START, a month before it
    // is sent: one minted by the resume, at the later clock, would pass under any expiry. And
    // the resume a month on hands back that same token, which a token carrying the time it was
    // minted could not.
    const hash = await openForm()
    const started = await startDraft(deps, { path: 'contact-us' })
    if (started === undefined) throw new Error('no draft')
    await saveDraft(deps, { path: 'contact-us', draftId: started.draftId, token: started.token, data: { email: 'a@b.ch' } })

    now = '2026-11-12T09:00:00.000Z'
    const resumed = await resumeDraft(deps, { path: 'contact-us', draftId: started.draftId, token: started.token })
    if (resumed?.outcome !== 'resumed') throw new Error('not resumed')
    expect(resumed.submissionToken).toBe(started.submissionToken)

    expect(await send(hash, started.submissionToken, resumed.data)).toMatchObject({ ok: true, id: started.draftId })
    expect(await send(hash, started.submissionToken, resumed.data)).toMatchObject({ ok: false, kind: 'token_spent' })
  })

  test("a form's token sent a month after it was handed out still submits", async () => {
    // A form left open in a tab over a holiday is a response that was never sent. Refused for
    // its age, it is lost the moment it is sent — the page has nothing to tell the respondent
    // but to start again.
    const hash = await openForm()
    const token = await handedOut()

    now = '2026-11-12T09:00:00.000Z'

    expect(await send(hash, token)).toMatchObject({ ok: true, id: token.split('.')[0] })
  })
})
