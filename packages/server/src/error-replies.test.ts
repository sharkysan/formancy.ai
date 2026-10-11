import { channel } from 'node:diagnostics_channel'
import { Readable } from 'node:stream'
import { afterEach, describe, expect, test } from 'vitest'
import type { FastifyInstance, RouteOptions } from 'fastify'
import { createMemoryStorage } from '@formancy/server-core'
import type { Completer, Storage } from '@formancy/server-core'
import { createApp } from './app.js'
import type { AppOptions } from './app.js'
import type { LogSink } from './server-log.js'

/**
 * What an error answers its client with (0172).
 *
 * Fastify's default reply to an error is `{ statusCode, code, error, message }`, the message
 * being the thrown error's own. Each case throws something whose words must not reach whoever
 * asked — a query and its parameters, a path on the server's disk — from the storage a route
 * reads, and reads back the reply and the log the server keeps.
 */
let app: FastifyInstance | undefined

afterEach(async () => {
  await app?.close()
  app = undefined
})

function capture(): { sink: LogSink; lines: () => Array<Record<string, unknown>> } {
  const written: string[] = []
  return {
    sink: { write: (line: string) => written.push(line) },
    lines: () => written.map((line) => JSON.parse(line) as Record<string, unknown>),
  }
}

/** An app whose form lookup — the first thing `GET /f/:path` asks — fails with `thrown`. */
async function failing(thrown: unknown, options: Partial<AppOptions> = {}): Promise<FastifyInstance> {
  const storage: Storage = { ...createMemoryStorage(), getFormByPath: () => Promise.reject(thrown) }
  app = await createApp(storage, { authSecret: 'a-test-secret-that-is-long-enough-to-sign', ...options })
  return app
}

/** What a Drizzle query error looks like: its message is the query and its parameters. */
class DrizzleQueryError extends Error {
  constructor(params: string) {
    super(`Failed query: select "id" from "forms" where "path" = $1\nparams: ${params}`)
    this.cause = Object.assign(new Error(`invalid input syntax for type uuid: "${params}"`), {
      name: 'PostgresError',
      code: '22P02',
    })
  }
}

describe('a 5xx', () => {
  test('says which status it is and nothing of what was thrown, and the log still says what that was', async () => {
    // The defect: Fastify's reply carried the error's message, and a database error's message
    // is the failing query and its parameters — handed to whoever made the request, anonymous
    // on the public plane. The log had stopped writing it (0168); the reply had not.
    const log = capture()
    const answered = await (
      await failing(new DrizzleQueryError('planted-secret-5d1e'), { log: { sink: log.sink, level: 'info' } })
    ).inject({ method: 'GET', url: '/f/contact' })

    expect(answered.statusCode).toBe(500)
    expect(answered.json()).toEqual({ statusCode: 500, error: 'Internal Server Error', message: 'Internal Server Error' })
    expect(answered.body).not.toMatch(/planted|select|params|22P02/)
    // Fastify writes its line about an error only from its own default handler, so a reply
    // decided by an error handler of our own would have taken this line with it.
    expect(log.lines()).toContainEqual({
      time: expect.any(String),
      level: 'error',
      event: 'request.failed',
      reqId: expect.stringMatching(/^req-/),
      method: 'GET',
      route: '/f/:path',
      status: 500,
      kind: 'DrizzleQueryError',
      code: '22P02',
    })
  })

  test('says nothing of it either from an app that keeps no log, which is how a host embeds it', async () => {
    // What the reply carries is not the log's business: a host that keeps its own output, and
    // so passes no log, must not get the old reply back.
    const answered = await (await failing(new DrizzleQueryError('planted-secret-8a0c'))).inject({
      method: 'GET',
      url: '/f/contact',
    })

    expect(answered.statusCode).toBe(500)
    expect(answered.body).not.toContain('planted')
  })

  test('from a fault does not carry the fault’s code either', async () => {
    // A disk that filled says `ENOSPC` and the path it could not write. The code is the
    // operator's to read in the log; to the client it says which dependency failed.
    const log = capture()
    const disk = Object.assign(new Error("ENOSPC: no space left on device, open '/data/planted-path-41c2'"), {
      code: 'ENOSPC',
    })
    const answered = await (await failing(disk, { log: { sink: log.sink, level: 'info' } })).inject({
      method: 'GET',
      url: '/f/contact',
    })

    expect(answered.json()).toEqual({ statusCode: 500, error: 'Internal Server Error', message: 'Internal Server Error' })
    expect(log.lines()).toContainEqual(expect.objectContaining({ event: 'request.failed', code: 'ENOSPC' }))
  })

  test('from an error made to be answered keeps its status and its code, and not its words', async () => {
    // An error that names its own status was made to be answered, and its code is part of the
    // answer: `RATE_LIMIT_UNAVAILABLE` is how a client tells a login that could not be counted
    // from any other 503 (0170). Its sentence is still words.
    const made = Object.assign(new Error('planted-words-7f3a could not be done'), {
      statusCode: 503,
      code: 'PLANTED_CODE',
    })
    const answered = await (await failing(made)).inject({ method: 'GET', url: '/f/contact' })

    expect(answered.statusCode).toBe(503)
    expect(answered.json()).toEqual({
      statusCode: 503,
      code: 'PLANTED_CODE',
      error: 'Service Unavailable',
      message: 'Service Unavailable',
    })
  })

  test('keeps a code only in the shape a code has, never a sentence put where one goes', async () => {
    // The log's own rule for a code (0168): capitals, digits and underscores. A dependency that
    // put words in its error's `code` would otherwise have them answered.
    const made = Object.assign(new Error('unavailable'), { statusCode: 503, code: 'planted words-0b9d in a code' })
    const answered = await (await failing(made)).inject({ method: 'GET', url: '/f/contact' })

    expect(answered.statusCode).toBe(503)
    expect(answered.json()).toEqual({ statusCode: 503, error: 'Service Unavailable', message: 'Service Unavailable' })
  })

  test('from something thrown that is not an error is answered the same way', async () => {
    // A promise rejected with a sentence: no class, no code, and nothing but its words.
    const answered = await (await failing('planted-sentence-2c6d about the database')).inject({
      method: 'GET',
      url: '/f/contact',
    })

    expect(answered.statusCode).toBe(500)
    expect(answered.json()).toEqual({ statusCode: 500, error: 'Internal Server Error', message: 'Internal Server Error' })
  })

  test('whose status has no name is answered with a general one, not the error’s words', async () => {
    const made = Object.assign(new Error('planted-words-91e4'), { statusCode: 599 })
    const answered = await (await failing(made)).inject({ method: 'GET', url: '/f/contact' })

    expect(answered.statusCode).toBe(599)
    expect(answered.json()).toEqual({ statusCode: 599, error: 'Server Error', message: 'Server Error' })
  })

  test('that a route answers itself keeps the words it chose', async () => {
    // Only an error's reply is replaced. A route that answers a 5xx — here, no file store —
    // wrote its sentence for the person reading it, and nothing was thrown.
    app = await createApp(createMemoryStorage(), { authSecret: 'a-test-secret-that-is-long-enough-to-sign' })
    const answered = await app.inject({
      method: 'POST',
      url: '/f/contact/files',
      payload: { field: 'evidence', name: 'a.pdf', size: 10, contentType: 'application/pdf' },
    })

    expect(answered.statusCode).toBe(501)
    expect(answered.json()).toEqual({
      error: 'uploads_unavailable',
      message: 'This deployment has no file store configured, so it cannot accept uploads.',
    })
  })
})

describe('a 4xx', () => {
  test('is answered as Fastify answers it, words and all, because they were written for the client', async () => {
    // A refusal's sentence says what to fix. Withholding it would make every 4xx a guess.
    app = await createApp(createMemoryStorage(), { authSecret: 'a-test-secret-that-is-long-enough-to-sign' })
    const answered = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: '{"email":',
    })

    expect(answered.statusCode).toBe(400)
    expect(answered.json()).toEqual({
      statusCode: 400,
      code: 'FST_ERR_CTP_INVALID_JSON_BODY',
      error: 'Bad Request',
      message: "Body is not valid JSON but content-type is set to 'application/json'",
    })
  })

  test('thrown with its own status keeps its message', async () => {
    const answered = await (
      await failing(Object.assign(new Error('That form is being changed; try again.'), { statusCode: 409 }))
    ).inject({ method: 'GET', url: '/f/contact' })

    expect(answered.statusCode).toBe(409)
    expect(answered.json()).toEqual({ statusCode: 409, error: 'Conflict', message: 'That form is being changed; try again.' })
  })

  test('from a fault, under a 4xx its reply already had, says only that status', async () => {
    // Fastify keeps a reply's status when it is already 400 or more, so a fault thrown after a
    // route chose one — or while its refusal was being written, as a header Node would not
    // write did on every route — was answered under that 4xx with the fault's own words:
    // `ERR_INVALID_CHAR` and Node's sentence under `401 Unauthorized` (0175). Only an error
    // that names its own status wrote its words for the client.
    const planted = await plain()
    planted.get('/planted', async (_request, reply) => {
      reply.code(404)
      throw new Error('planted-words-3e7b from below')
    })

    const answered = await planted.inject({ method: 'GET', url: '/planted' })

    expect(answered.statusCode).toBe(404)
    expect(answered.json()).toEqual({ statusCode: 404, error: 'Not Found', message: 'Not Found' })
  })
})

/** A header value Node refuses to write: U+0001 is no character a header may hold. */
const UNWRITABLE = 'planted\u0001value'

/** A plain app, with a route of the case's own beside every route the server has. */
async function plain(options: Partial<AppOptions> = {}): Promise<FastifyInstance> {
  app = await createApp(createMemoryStorage(), { authSecret: 'a-test-secret-that-is-long-enough-to-sign', ...options })
  return app
}

describe('an error thrown while the headers are written', () => {
  // Node checks a header's value when the reply is written, after the route has answered, and
  // throws `ERR_INVALID_CHAR`. Fastify answers that error with the headers the reply already
  // had, so the error's own reply failed the same way, and Fastify's last resort wrote it
  // without running any hook: `ERR_INVALID_CHAR` and Node's sentence naming the header, in a
  // 500 — the way a file's name outside Latin-1 reached its downloader (0175).

  test('is answered as any 5xx, without the header, and the log says what was thrown', async () => {
    const log = capture()
    const planted = await plain({ log: { sink: log.sink, level: 'info' } })
    planted.get('/planted', async (_request, reply) => reply.header('x-planted', UNWRITABLE).send({ ok: true }))

    const answered = await planted.inject({ method: 'GET', url: '/planted' })

    expect(answered.statusCode).toBe(500)
    expect(answered.json()).toEqual({ statusCode: 500, error: 'Internal Server Error', message: 'Internal Server Error' })
    expect(answered.headers['x-planted']).toBeUndefined()
    // The operator still learns which route failed and how, from the line Fastify writes.
    expect(log.lines()).toContainEqual(
      expect.objectContaining({ event: 'request.failed', route: '/planted', status: 500, kind: 'TypeError', code: 'ERR_INVALID_CHAR' }),
    )
  })

  test('is answered the same when the body is a stream, which is how a file is served', async () => {
    // A stream's headers are set one by one before it is piped, rather than written at once:
    // the other place Node checks them, and the one the download route reaches.
    const planted = await plain()
    planted.get('/planted', async (_request, reply) =>
      reply.header('content-disposition', `attachment; filename="${UNWRITABLE}"`).send(Readable.from([Buffer.from('bytes')])),
    )

    const answered = await planted.inject({ method: 'GET', url: '/planted' })

    expect(answered.statusCode).toBe(500)
    expect(answered.json()).toEqual({ statusCode: 500, error: 'Internal Server Error', message: 'Internal Server Error' })
    expect(answered.headers['content-disposition']).toBeUndefined()
  })

  test('leaves a 4xx its own words and drops the header', async () => {
    // The error's reply carries every header the route set before it threw. Without the one
    // that cannot be written dropped, a refusal became Node's sentence under the refusal's
    // status: a 409 saying `Invalid character in header content`.
    const planted = await plain()
    planted.get('/planted', async (_request, reply) => {
      reply.header('x-planted', UNWRITABLE)
      throw Object.assign(new Error('That form is being changed; try again.'), { statusCode: 409 })
    })

    const answered = await planted.inject({ method: 'GET', url: '/planted' })

    expect(answered.json()).toEqual({ statusCode: 409, error: 'Conflict', message: 'That form is being changed; try again.' })
    expect(answered.headers['x-planted']).toBeUndefined()
  })
})

describe('every route the server registers', () => {
  test('answers a reply whose header cannot be written without a word of what Node threw', async () => {
    // The two cases above on one planted route; this is every route, read from the route table
    // as Fastify registers it — through the `fastify.initialization` channel the rate limits'
    // guard uses (0170) — with a header Node cannot write put on every request before its
    // route runs. A hook a route or a plugin adds after the one that drops it could put one
    // back, or throw while the error's reply is sent, and either goes out through Fastify's
    // last resort with Node's words: that is what each answer here is read for.
    const routes: Array<{ method: string; url: string }> = []
    const initialization = channel('fastify.initialization')
    const watch = (message: unknown): void => {
      const { fastify } = message as { fastify: FastifyInstance }
      fastify.addHook('onRoute', (route: RouteOptions) => {
        for (const method of [route.method].flat()) routes.push({ method, url: route.url })
      })
      fastify.addHook('onRequest', async (_request, reply) => {
        reply.header('x-planted', UNWRITABLE)
      })
    }
    const completer: Completer = { complete: () => Promise.resolve({ ok: true, text: '{}' }) }
    const never = (): Promise<never> => Promise.reject(new Error('the file store was reached'))
    let server: FastifyInstance
    initialization.subscribe(watch)
    try {
      server = await plain({
        challengeSecret: 'a-challenge-secret-long-enough-to-sign-with',
        fileStore: { put: never, open: never, remove: never, sizeOf: never },
        model: { provider: 'anthropic', model: 'claude-test', completer },
      })
    } finally {
      initialization.unsubscribe(watch)
    }

    // A guard on the guard: a hook that stopped seeing routes would leave nothing to read.
    expect(routes.map(({ method, url }) => `${method} ${url}`)).toEqual(
      expect.arrayContaining(['GET /f/:path/files/:id', 'GET /f/:path/submissions/export.csv', 'HEAD /f/:path/files/:id']),
    )

    const spoke: string[] = []
    // And a path no route has, which Fastify's own not-found handler answers.
    for (const { method, url } of [...routes, { method: 'GET', url: '/no/such/route' }]) {
      const answered = await server.inject({
        method: method as 'GET',
        url: url.replace(/:([^/]+)/g, (_, name: string) => `${name}-1`),
        ...(method === 'GET' || method === 'HEAD' ? {} : { payload: {} }),
      })
      if (/ERR_INVALID_CHAR|Invalid character|x-planted/.test(answered.body) || answered.headers['x-planted'] !== undefined) {
        spoke.push(`${method} ${url}: ${String(answered.statusCode)} ${answered.body}`)
      }
    }
    expect(spoke).toEqual([])
  })
})
