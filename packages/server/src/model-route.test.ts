import { request as httpRequest } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, test } from 'vitest'
import type { FastifyInstance } from 'fastify'
import {
  authorForm,
  declinedAnswer,
  draftScenarios,
  modelBriefing,
  modelRequestKind,
  translateCatalogue,
} from '@formancy/builder-core'
import type { AskModel } from '@formancy/builder-core'
import type { FormSchema } from '@formancy/spec'
import { createMemoryStorage } from '@formancy/server-core'
import type { Cancellation, Completer, Completion, CompletionPrompt, Storage } from '@formancy/server-core'
import { createApp } from './app.js'
import { MODEL_BODY_LIMIT_BYTES } from './routes/model.js'
import type { DeploymentModel } from './routes/model.js'
import type { LogLevel, LogSink } from './server-log.js'

/**
 * The route a builder's `AskModel` calls, through `createApp`, with a double behind the
 * port (0165).
 *
 * The operator's key is on this server and pays for every call, so what is under test is who
 * may make one, what they may make it ask, how big and how often, and that a browser which
 * goes away stops paying for the answer. The adapters behind the port have their own tests;
 * this is the HTTP surface around them.
 */
const SECRET = 'a-test-secret-that-is-long-enough-to-sign'
const ADMIN = { email: 'root@test.ch', password: 'root-password-1' }

let app: FastifyInstance | undefined

afterEach(async () => {
  await app?.close()
  app = undefined
})

/** A completer that records each prompt and answers with `answer`. */
function double(answer: Completion = { ok: true, text: '{"specVersion":"4"}' }): {
  completer: Completer
  asked: CompletionPrompt[]
} {
  const asked: CompletionPrompt[] = []
  return {
    asked,
    completer: {
      complete: (prompt) => {
        asked.push(prompt)
        return Promise.resolve(answer)
      },
    },
  }
}

interface Served {
  readonly app: FastifyInstance
  readonly storage: Storage
  /** A session for each role, signed in through the real login. */
  readonly tokens: { readonly admin: string; readonly editor: string; readonly viewer: string; readonly other: string }
}

async function serve(
  model: DeploymentModel | undefined,
  limit = { max: 1_000, timeWindowMs: 60_000 },
  storage: Storage = createMemoryStorage(),
  log?: { sink: LogSink; level: LogLevel },
): Promise<Served> {
  app = await createApp(storage, {
    authSecret: SECRET,
    bootstrapAdmin: ADMIN,
    loginRateLimit: { max: 1_000, timeWindowMs: 60_000 },
    modelRateLimit: limit,
    ...(model === undefined ? {} : { model }),
    ...(log === undefined ? {} : { log }),
  })
  const login = async (email: string, password: string): Promise<string> =>
    (
      (await app!.inject({ method: 'POST', url: '/auth/login', payload: { email, password } })).json() as {
        token: string
      }
    ).token
  const admin = await login(ADMIN.email, ADMIN.password)
  for (const [email, role] of [
    ['editor@test.ch', 'editor'],
    ['other@test.ch', 'editor'],
    ['viewer@test.ch', 'viewer'],
  ] as const) {
    await app.inject({
      method: 'POST',
      url: '/users',
      headers: { authorization: `Bearer ${admin}` },
      payload: { email, password: `${role}-password-1`, role },
    })
  }
  return {
    app,
    storage,
    tokens: {
      admin,
      editor: await login('editor@test.ch', 'editor-password-1'),
      other: await login('other@test.ch', 'editor-password-1'),
      viewer: await login('viewer@test.ch', 'viewer-password-1'),
    },
  }
}

const configured = (completer: Completer): DeploymentModel => ({ provider: 'anthropic', model: 'claude-test', completer })

function ask(server: FastifyInstance, token: string | undefined, payload: unknown) {
  return server.inject({
    method: 'POST',
    url: '/model/complete',
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
    payload: payload as Record<string, unknown>,
  })
}

describe('whether there is a model', () => {
  test('is said to somebody who may edit a form: the provider and the model', async () => {
    // How the admin decides to draw the prompt pane at all.
    const { app, tokens } = await serve(configured(double().completer))
    const response = await app.inject({ method: 'GET', url: '/model', headers: { authorization: `Bearer ${tokens.editor}` } })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ provider: 'anthropic', model: 'claude-test' })
  })

  test('is 404 when this deployment has none', async () => {
    // Off unless set: the admin draws nothing new, rather than a button that cannot work.
    const { app, tokens } = await serve(undefined)
    const response = await app.inject({ method: 'GET', url: '/model', headers: { authorization: `Bearer ${tokens.editor}` } })
    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({ error: 'model_not_configured' })
  })

  test('is not said to a visitor or a viewer', async () => {
    // Which provider a deployment pays is the operator's business, not the public's.
    const { app, tokens } = await serve(configured(double().completer))
    expect((await app.inject({ method: 'GET', url: '/model' })).statusCode).toBe(401)
    expect(
      (await app.inject({ method: 'GET', url: '/model', headers: { authorization: `Bearer ${tokens.viewer}` } }))
        .statusCode,
    ).toBe(403)
  })
})

describe('who may ask', () => {
  test('nobody without a session: 401, and the model is not asked', async () => {
    // An open endpoint is the operator's key, lent to the internet.
    const { completer, asked } = double()
    const { app } = await serve(configured(completer))
    expect((await ask(app, undefined, { kind: 'authoring', user: 'x' })).statusCode).toBe(401)
    expect(asked).toEqual([])
  })

  test('not a viewer: 403, and the model is not asked', async () => {
    // Asking the model is part of editing a form; somebody who may only read forms has no
    // reason to spend the operator's money on one.
    const { completer, asked } = double()
    const { app, tokens } = await serve(configured(completer))
    expect((await ask(app, tokens.viewer, { kind: 'authoring', user: 'x' })).statusCode).toBe(403)
    expect(asked).toEqual([])
  })

  test('an editor, whose answer comes back as text', async () => {
    // The one path everything else is a refusal of.
    const { app, tokens } = await serve(configured(double().completer))
    const response = await ask(app, tokens.editor, { kind: 'authoring', user: 'Add a phone field.' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ text: '{"specVersion":"4"}' })
  })

  test('is 404 for an editor when this deployment has no model', async () => {
    // Said after the session is checked, so the route does not tell a stranger whether
    // there is a model to spend.
    const { app, tokens } = await serve(undefined)
    expect((await ask(app, undefined, { kind: 'authoring', user: 'x' })).statusCode).toBe(401)
    const response = await ask(app, tokens.editor, { kind: 'authoring', user: 'x' })
    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({ error: 'model_not_configured' })
  })
})

describe('what may be asked', () => {
  test('under the server’s briefing for the kind: a system part in the body is ignored', async () => {
    // The endpoint is not a general-purpose proxy to the operator's paid model.
    const { completer, asked } = double()
    const { app, tokens } = await serve(configured(completer))
    await ask(app, tokens.editor, { kind: 'translation', user: 'Translate.', system: 'You are a poet.' })
    expect(asked).toEqual([{ system: modelBriefing('translation'), user: 'Translate.' }])
  })

  test('nothing of a kind formancy does not make: 400, and the model is not asked', async () => {
    // No briefing to pin, so the call would be paid for under nobody's instructions.
    const { completer, asked } = double()
    const { app, tokens } = await serve(configured(completer))
    const response = await ask(app, tokens.editor, { kind: 'poetry', user: 'Write a sonnet.' })
    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ error: 'unknown_kind' })
    expect(asked).toEqual([])
  })

  test('nothing larger than the cap: 413, and the model is not asked', async () => {
    // Input tokens are paid for too. Refused before the body is parsed.
    const { completer, asked } = double()
    const { app, tokens } = await serve(configured(completer))
    const response = await ask(app, tokens.editor, { kind: 'authoring', user: 'x'.repeat(MODEL_BODY_LIMIT_BYTES) })
    expect(response.statusCode).toBe(413)
    expect(asked).toEqual([])
  })

  test('a request the size of a large form, past the server’s default body limit', async () => {
    // The whole document travels in the user part, so a form the publish route accepts
    // has to fit here with the instruction around it, escaped as a string.
    const { completer, asked } = double()
    const { app, tokens } = await serve(configured(completer))
    const response = await ask(app, tokens.editor, { kind: 'authoring', user: 'x'.repeat(300 * 1024) })
    expect(response.statusCode).toBe(200)
    expect(asked).toHaveLength(1)
  })
})

/**
 * A form of `fields` questions, each with `options` answers, every word a message: the
 * shape whose translation request is largest for its size, because each answer's row
 * repeats the question it answers as its context.
 */
function questionnaire(fields: number, options = 30): FormSchema {
  const en: Record<string, string> = {}
  const questions = Array.from({ length: fields }, (_, f) => {
    en[`q${String(f)}`] = `How often in the last month did situation ${String(f)} apply to you at work?`
    return {
      key: `q${String(f)}`,
      type: 'select' as const,
      label: { $t: `q${String(f)}` },
      options: Array.from({ length: options }, (_, o) => {
        en[`q${String(f)}.a${String(o)}`] = `Answer number ${String(o)} to question ${String(f)}`
        return { value: `a${String(o)}`, label: { $t: `q${String(f)}.a${String(o)}` } }
      }),
    }
  })
  return { specVersion: '4', id: 'survey', title: 'Survey', model: { fields: questions }, i18n: { defaultLocale: 'en', messages: { en } } }
}

describe('what a builder sends about a form', () => {
  test('is taken for every kind, for the largest form this server publishes', async () => {
    // The cap is the route's own, and has to hold what the builders send about any form
    // the publish route takes. A translation repeats each question as the context of every
    // one of its answers, pretty-printed and escaped again, so it is the largest of the
    // three: a cap sized by the authoring request refuses the Translations tab a form the
    // server has just published, with "Request body is too large".
    const { completer, asked } = double({ ok: false, failure: 'refused', reason: 'Recorded, not answered.' })
    const { app, tokens } = await serve(configured(completer))
    const publish = (path: string, schema: FormSchema) =>
      app.inject({
        method: 'POST',
        url: '/forms',
        headers: { authorization: `Bearer ${tokens.editor}` },
        payload: { path, schema },
      })
    // As many questions as the server's default limit publishes, and one more is refused:
    // the route says which, so a default that moves fails here rather than going unnoticed.
    let fields = 1
    while (Buffer.byteLength(JSON.stringify({ path: 'survey', schema: questionnaire(fields + 1) })) <= 256 * 1024) fields += 1
    const form = questionnaire(fields)
    expect((await publish('survey', form)).statusCode).toBe(201)
    expect((await publish('survey-larger', questionnaire(fields + 1))).statusCode).toBe(413)

    const statuses: number[] = []
    const throughTheRoute: AskModel = async (prompt) => {
      const response = await ask(app, tokens.editor, { kind: modelRequestKind(prompt.system), user: prompt.user })
      statuses.push(response.statusCode)
      return declinedAnswer('Recorded, not answered.')
    }
    await authorForm(throughTheRoute, 'Add a phone number.', { current: form })
    await translateCatalogue(throughTheRoute, form, 'de')
    await draftScenarios(throughTheRoute, form, 'Every question is answered.')

    expect(statuses).toEqual([200, 200, 200])
    expect(asked.map((prompt) => prompt.system)).toEqual([
      modelBriefing('authoring'),
      modelBriefing('translation'),
      modelBriefing('scenarios'),
    ])
  }, 30_000)
})

describe('how often', () => {
  test('a limit per person: past it 429, while somebody else still gets through', async () => {
    // Every call is the operator's money. Counted per session rather than per address,
    // so an office behind one address is not one budget, and one editor cannot spend
    // another's.
    const { completer, asked } = double()
    const { app, tokens } = await serve(configured(completer), { max: 2, timeWindowMs: 60_000 })
    expect((await ask(app, tokens.editor, { kind: 'authoring', user: 'one' })).statusCode).toBe(200)
    expect((await ask(app, tokens.editor, { kind: 'authoring', user: 'two' })).statusCode).toBe(200)
    expect((await ask(app, tokens.editor, { kind: 'authoring', user: 'three' })).statusCode).toBe(429)
    expect((await ask(app, tokens.other, { kind: 'authoring', user: 'four' })).statusCode).toBe(200)
    expect(asked.map((prompt) => prompt.user)).toEqual(['one', 'two', 'four'])
  })
})

describe('what comes back when there is no answer', () => {
  test('a refusal is a decline, with its reason, so the run ends on one turn', async () => {
    // Returned as text it would be checked as a form, and asked again.
    const { app, tokens } = await serve(
      configured(double({ ok: false, failure: 'refused', reason: 'The model service declined this request.' }).completer),
    )
    const response = await ask(app, tokens.editor, { kind: 'authoring', user: 'x' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ declined: 'The model service declined this request.' })
  })

  test('an answer cut off at the limit is a 502, never half a document', async () => {
    const { app, tokens } = await serve(configured(double({ ok: false, failure: 'truncated' }).completer))
    const response = await ask(app, tokens.editor, { kind: 'authoring', user: 'x' })
    expect(response.statusCode).toBe(502)
    expect(response.json()).toMatchObject({ error: 'model_truncated' })
    expect(response.json()).not.toHaveProperty('text')
  })

  test('a refused key is said as one, the provider’s own words stay on the server, and the status is audited', async () => {
    // The person reads the reason as the run's ending. "Unavailable" for a key the
    // provider refuses sends them to wait for an outage that is not happening; the
    // provider's body can name the account, so it reaches neither the person, the audit row
    // nor the log. The operator has the status, in both of those (C3).
    const written: string[] = []
    const { app, tokens, storage } = await serve(
      configured(
        double({ ok: false, failure: 'unavailable', status: 401, cause: 'invalid x-api-key for org-12345' }).completer,
      ),
      undefined,
      undefined,
      { sink: { write: (line) => written.push(line) }, level: 'info' },
    )
    const response = await ask(app, tokens.editor, { kind: 'authoring', user: 'x' })
    expect(response.statusCode).toBe(502)
    expect(response.json()).toMatchObject({ error: 'model_unavailable' })
    expect((response.json() as { message: string }).message).toMatch(/key/)
    expect(response.body).not.toContain('org-12345')
    const [entry] = (await storage.listAudit(10)).filter((row) => row.action === 'model.asked')
    expect(entry?.detail).toMatchObject({ outcome: 'unavailable', status: 401 })
    expect(JSON.stringify(entry)).not.toContain('org-12345')
    expect(written.map((line) => JSON.parse(line) as unknown)).toContainEqual(
      expect.objectContaining({ level: 'error', event: 'model.unreachable', upstream: 401 }),
    )
    expect(written.join('')).not.toContain('org-12345')
  })
})

describe('the sentence a failure is said with', () => {
  test.each([
    [429, /limiting this server/],
    [404, /may not exist/],
    [400, /may not exist/],
    [403, /key/],
    [500, /could not be reached/],
    [undefined, /could not be reached/],
  ])('for a provider status of %s', async (status, sentence) => {
    // It is the reason the person's run ended. "Could not be reached" for a provider
    // limiting the server sends them to wait for an outage; for a model the provider does
    // not have, to wait for ever.
    const failure: Completion =
      status === undefined
        ? { ok: false, failure: 'unavailable', cause: 'fetch failed' }
        : { ok: false, failure: 'unavailable', status, cause: 'the provider said so' }
    const { app, tokens } = await serve(configured(double(failure).completer))
    const response = await ask(app, tokens.editor, { kind: 'authoring', user: 'x' })
    expect(response.statusCode).toBe(502)
    expect((response.json() as { message: string }).message).toMatch(sentence)
  })

  test('a request with nothing to ask is a 400, and the model is not asked', async () => {
    // The briefing alone would be paid for and answer nothing anybody asked.
    const { completer, asked } = double()
    const { app, tokens } = await serve(configured(completer))
    const response = await ask(app, tokens.editor, { kind: 'authoring', user: '   ' })
    expect(response.statusCode).toBe(400)
    expect(asked).toEqual([])
  })
})

describe('what is recorded', () => {
  test('who asked, which kind, how much and how it ended — never the text', async () => {
    // The answer to "who ran up this bill": the audit log, as for an export. The text is
    // a form, and an audit log is kept longer and read more widely than a form.
    const { app, tokens, storage } = await serve(configured(double().completer))
    await ask(app, tokens.editor, { kind: 'scenarios', user: 'Secret plans for the form.' })
    const [entry] = (await storage.listAudit(10)).filter((row) => row.action === 'model.asked')
    expect(entry).toMatchObject({
      action: 'model.asked',
      actorKind: 'user',
      subject: 'scenarios',
      detail: { provider: 'anthropic', model: 'claude-test', characters: 26, outcome: 'answered' },
    })
    expect(JSON.stringify(entry)).not.toContain('Secret plans')
  })
})

describe('a browser that goes away', () => {
  test('abandons the call to the model', async () => {
    // The client is the browser: the person pressed Stop, closed the tab or lost the
    // network. Without this, the provider writes the whole answer and the operator pays
    // for it, for nobody.
    let cancelled = false
    let asked = (): void => undefined
    const started = new Promise<void>((resolve) => (asked = resolve))
    const completer: Completer = {
      complete: (_prompt, cancellation: Cancellation) =>
        new Promise((resolve) => {
          cancellation.onCancel(() => {
            cancelled = true
            resolve({ ok: false, failure: 'cancelled' })
          })
          asked()
        }),
    }
    const { app, tokens } = await serve(configured(completer))
    await app.listen({ port: 0, host: '127.0.0.1' })
    const { port } = app.server.address() as AddressInfo

    const body = JSON.stringify({ kind: 'authoring', user: 'A long request.' })
    const client = httpRequest({
      host: '127.0.0.1',
      port,
      method: 'POST',
      path: '/model/complete',
      headers: { authorization: `Bearer ${tokens.editor}`, 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
    })
    client.on('error', () => undefined)
    client.end(body)
    await started
    expect(cancelled).toBe(false)

    client.destroy()
    await expect.poll(() => cancelled, { timeout: 2_000 }).toBe(true)
  }, 10_000)

  test('while it is still being let in is never paid for: the call is abandoned before it leaves', async () => {
    // A browser can go before the handler runs — an API key's hash takes a while to check.
    // The response has closed by then and never closes again, so a cancellation that only
    // listens from the handler on is told nothing, and the provider writes the whole answer
    // for nobody. Here the key's lookup is held until the browser has gone.
    const storage = createMemoryStorage()
    let entered = (): void => undefined
    const looking = new Promise<void>((resolve) => (entered = resolve))
    let release = (): void => undefined
    const released = new Promise<void>((resolve) => (release = resolve))
    let hold = false
    const held: Storage = {
      ...storage,
      findApiKeysByPrefix: async (prefix) => {
        if (hold) {
          entered()
          await released
        }
        return storage.findApiKeysByPrefix(prefix)
      },
    }
    let ended: 'answered' | 'cancelled' | undefined
    const completer: Completer = {
      complete: (_prompt, cancellation) =>
        new Promise((resolve) => {
          // An answer in a second and a half, unless told the asker has gone.
          const answered = setTimeout(() => {
            ended = 'answered'
            resolve({ ok: true, text: '{}' })
          }, 1_500)
          cancellation.onCancel(() => {
            clearTimeout(answered)
            ended = 'cancelled'
            resolve({ ok: false, failure: 'cancelled' })
          })
        }),
    }
    const { app, tokens } = await serve(configured(completer), undefined, held)
    const minted = await app.inject({
      method: 'POST',
      url: '/api-keys',
      headers: { authorization: `Bearer ${tokens.admin}` },
      payload: { name: 'a script', role: 'editor' },
    })
    const { secret } = minted.json() as { secret: string }
    let closed: Promise<void> = Promise.resolve()
    app.server.on('request', (_request: IncomingMessage, response: ServerResponse) => {
      closed = new Promise((resolve) => response.once('close', () => resolve()))
    })
    await app.listen({ port: 0, host: '127.0.0.1' })
    const { port } = app.server.address() as AddressInfo

    hold = true
    const body = JSON.stringify({ kind: 'authoring', user: 'A long request.' })
    const client = httpRequest({
      host: '127.0.0.1',
      port,
      method: 'POST',
      path: '/model/complete',
      headers: { 'x-formancy-api-key': secret, 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
    })
    client.on('error', () => undefined)
    client.end(body)
    await looking
    client.destroy()
    await closed
    release()

    await expect.poll(() => ended, { timeout: 3_000 }).not.toBeUndefined()
    expect(ended).toBe('cancelled')
  }, 10_000)

  test('but an answer that arrived is not cancelled after it was sent', async () => {
    // The connection closing after a reply is how every request ends; reading that as a
    // browser gone away would tell the adapter to abandon a call that already finished.
    let cancelled = false
    const completer: Completer = {
      complete: (_prompt, cancellation) => {
        cancellation.onCancel(() => (cancelled = true))
        return Promise.resolve({ ok: true, text: '{}' })
      },
    }
    const { app, tokens } = await serve(configured(completer))
    await app.listen({ port: 0, host: '127.0.0.1' })
    const { port } = app.server.address() as AddressInfo
    const response = await fetch(`http://127.0.0.1:${String(port)}/model/complete`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tokens.editor}`, 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'authoring', user: 'x' }),
    })
    expect(response.status).toBe(200)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(cancelled).toBe(false)
  })
})
