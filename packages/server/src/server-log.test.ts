import { afterEach, describe, expect, test } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { createMemoryStorage } from '@formancy/server-core'
import type { Storage } from '@formancy/server-core'
import { createApp } from './app.js'
import { createServerLog, databaseNotices, LOG_FIELDS } from './server-log.js'
import type { LogLevel, LogSink } from './server-log.js'

/**
 * The server's log, line by line (0168).
 *
 * What is under test is what a line may hold. Each case hands the log something it must not
 * write — a body, a header, a raw URL, an error's message — beside something it must, and
 * reads back exactly what reached the sink. The sink is the one the server writes to, not
 * `process.stdout` intercepted: a guard here once watched `process.stdout.write` while pino
 * wrote past it to the file descriptor, and passed over the configuration it existed to
 * refuse (`server.integration.test.ts` has the story).
 */
type Line = Record<string, unknown>

function capture(): { sink: LogSink; lines: () => Line[]; text: () => string } {
  const written: string[] = []
  return {
    sink: { write: (line: string) => written.push(line) },
    lines: () => written.map((line) => JSON.parse(line) as Line),
    text: () => written.join(''),
  }
}

let app: FastifyInstance | undefined

afterEach(async () => {
  await app?.close()
  app = undefined
})

async function serve(level: LogLevel, storage: Storage = createMemoryStorage()) {
  const log = capture()
  app = await createApp(storage, {
    authSecret: 'a-test-secret-that-is-long-enough-to-sign',
    log: { sink: log.sink, level },
  })
  return { app, log }
}

/** What a Drizzle query error looks like: its message is the query and its parameters. */
class DrizzleQueryError extends Error {
  constructor(params: string) {
    super(`Failed query: select "id" from "files" where "id" = $1\nparams: ${params}`)
    this.cause = Object.assign(new Error(`invalid input syntax for type uuid: "${params}"`), {
      name: 'PostgresError',
      code: '22P02',
    })
  }
}

describe('a request', () => {
  test('is one line: its method, its route as written, its status, how long it took and its id', async () => {
    // A line copied from the URL writes a form's path, a draft's id and every query string
    // into the log; this is the line every request gets, so it is the one that must not.
    const { app, log } = await serve('info')
    const response = await app.inject({ method: 'GET', url: '/f/planted-path-7d1c?key=planted-query-41fa' })
    expect(response.statusCode).toBe(404)

    expect(log.lines()).toEqual([
      {
        time: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/),
        level: 'info',
        event: 'request',
        reqId: expect.stringMatching(/^req-/),
        method: 'GET',
        route: '/f/:path',
        status: 404,
        ms: expect.any(Number),
      },
    ])
    expect(log.text()).not.toContain('planted')
  })

  test('that no route answers is written without one, never with the path it asked for', async () => {
    // Fastify's own line for this is "Route GET:/the/raw/url not found".
    const { app, log } = await serve('info')
    await app.inject({ method: 'GET', url: '/nowhere/planted-segment-90ab' })

    expect(log.lines()).toEqual([expect.objectContaining({ event: 'request', method: 'GET', status: 404 })])
    expect(log.lines()[0]).not.toHaveProperty('route')
    expect(log.text()).not.toContain('planted')
  })

  test('that throws is a second line, saying what was thrown and never what it says', async () => {
    // A database error's message is the query and its parameters — C3's "whatever was thrown,
    // unredacted", which a request log would otherwise write for every failing route.
    const storage: Storage = {
      ...createMemoryStorage(),
      getFormByPath: () => Promise.reject(new DrizzleQueryError('planted-param-3e8f')),
    }
    const { app, log } = await serve('info', storage)
    const response = await app.inject({ method: 'GET', url: '/f/contact' })
    expect(response.statusCode).toBe(500)

    const [failed, request] = log.lines()
    expect(failed).toEqual({
      time: expect.any(String),
      level: 'error',
      event: 'request.failed',
      reqId: request?.['reqId'],
      method: 'GET',
      route: '/f/:path',
      status: 500,
      kind: 'DrizzleQueryError',
      code: '22P02',
    })
    expect(request).toMatchObject({ event: 'request', status: 500 })
    expect(log.text()).not.toContain('planted')
    expect(log.text()).not.toContain('select')
  })

  test('refused before a handler ran is a refusal, at info, named by its code and not its body', async () => {
    // A body that does not parse is the client's mistake, not a fault: written at info and
    // named by Fastify's code, an operator can tell the two apart — and the body, which here
    // is somebody's email and password, is not written at all.
    const { app, log } = await serve('info')
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: '{"email":"planted-email-55c2@example.ch","password":planted-password-0b7e}',
    })
    expect(response.statusCode).toBe(400)

    expect(log.lines()).toEqual([
      expect.objectContaining({
        level: 'info',
        event: 'request.refused',
        status: 400,
        kind: 'FastifyError',
        code: 'FST_ERR_CTP_INVALID_JSON_BODY',
      }),
      expect.objectContaining({ level: 'info', event: 'request', status: 400, route: '/auth/login' }),
    ])
    expect(log.text()).not.toContain('planted')
  })

  test('has the id its audit row has, so the two can be read together', async () => {
    // A log line that cannot be matched to the audit row of the same request leaves the
    // operator two records of one event and no way to join them.
    const storage = createMemoryStorage()
    const { app, log } = await serve('info', storage)
    await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'nobody@example.ch', password: 'not-a-password' },
    })

    const [row] = await storage.listAudit(1)
    expect(row?.action).toBe('auth.login.failed')
    expect(log.lines()[0]?.['reqId']).toBe(row?.requestId)
  })

  test('whose audit row could not be written says so, by the row’s action and never its subject', async () => {
    // The audit writer promised to say so "loudly" while the server had no log to say it in.
    // The subject of a failed login is the email somebody tried, and a database error about
    // the row can quote it.
    const storage: Storage = {
      ...createMemoryStorage(),
      recordAudit: () => Promise.reject(new Error('planted-email-a1b2@example.ch could not be inserted')),
    }
    const { app, log } = await serve('info', storage)
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'planted-email-a1b2@example.ch', password: 'planted-password-c3d4' },
    })
    expect(response.statusCode).toBe(401)

    expect(log.lines()).toContainEqual({
      time: expect.any(String),
      level: 'error',
      event: 'audit.unwritten',
      reqId: expect.stringMatching(/^req-/),
      kind: 'Error',
      action: 'auth.login.failed',
    })
    expect(log.text()).not.toContain('planted')
  })

  test('refused by a rate limit is a line with its status, and not the address it was counted by', async () => {
    // Behind a proxy nobody named, every respondent shares one budget (D14), and this line is
    // all the operator sees of it. The address is the one thing it must not carry.
    const log = capture()
    app = await createApp(createMemoryStorage(), {
      authSecret: 'a-test-secret-that-is-long-enough-to-sign',
      submissionRateLimit: { max: 1, timeWindowMs: 60_000 },
      log: { sink: log.sink, level: 'info' },
    })
    const ask = () => app!.inject({ method: 'POST', url: '/f/contact/drafts', remoteAddress: '203.0.113.77' })
    await ask()
    expect((await ask()).statusCode).toBe(429)

    expect(log.lines().filter((line) => line['event'] === 'request').map((line) => line['status'])).toEqual([404, 429])
    expect(log.lines().at(-1)).toMatchObject({ route: '/f/:path/drafts', status: 429 })
    expect(log.text()).not.toContain('203.0.113.77')
  })

  test('below the level set is not written, and an error above it is', async () => {
    // A level that did not filter would be a setting that reads as configured and does
    // nothing; one that filtered errors out would hide the lines it exists for.
    const storage: Storage = {
      ...createMemoryStorage(),
      getFormByPath: () => Promise.reject(new DrizzleQueryError('planted-param-1a2b')),
    }
    const { app, log } = await serve('error', storage)
    await app.inject({ method: 'GET', url: '/nowhere' })
    await app.inject({ method: 'GET', url: '/f/contact' })

    expect(log.lines()).toEqual([expect.objectContaining({ level: 'error', event: 'request.failed' })])
  })
})

describe('what a line may hold', () => {
  const PLANTED = 'planted-c41d9e'

  test('only the fields on the list, whatever a call hands it', () => {
    // A call that passes a body, a header or an email along with its event would write
    // them: the list is what keeps them out, not anybody remembering not to.
    const log = capture()
    createServerLog(log.sink, 'trace').error(
      {
        event: 'audit.unwritten',
        action: 'auth.login.failed',
        body: { email: PLANTED },
        email: PLANTED,
        password: PLANTED,
        headers: { authorization: `Bearer ${PLANTED}` },
        url: `/f/x?token=${PLANTED}`,
        err: new Error(PLANTED),
      },
      `${PLANTED} in the message`,
    )

    expect(log.lines()).toEqual([
      { time: expect.any(String), level: 'error', event: 'audit.unwritten', action: 'auth.login.failed', kind: 'Error' },
    ])
    expect(log.text()).not.toContain(PLANTED)
    for (const key of Object.keys(log.lines()[0] ?? {})) expect(LOG_FIELDS).toContain(key)
  })

  test('a field on the list, only with a value of its kind', () => {
    // `action` is on the list for an audit row that could not be written; a string that is
    // not an audit action is somebody's data in that field.
    const log = capture()
    const server = createServerLog(log.sink, 'trace')
    server.error({ event: 'audit.unwritten', action: PLANTED, upstream: PLANTED })
    server.error({ event: 'model.unreachable', upstream: 401 })

    expect(log.lines()).toEqual([
      { time: expect.any(String), level: 'error', event: 'audit.unwritten' },
      { time: expect.any(String), level: 'error', event: 'model.unreachable', upstream: 401 },
    ])
  })

  test('an event not on the list is "unlisted" at warn and above, and is not written below', () => {
    // Fastify's own warnings carry a raw URL in their words. Written as said, they leak it;
    // dropped, a warning is lost. So the words go and the line stays — and below warn,
    // where Fastify says it is listening and that a route was not found, nothing does.
    const log = capture()
    const server = createServerLog(log.sink, 'trace')
    server.warn(`Reply was already sent, did you forget to "return reply" in the "/f/${PLANTED}" (GET) route?`)
    server.error({ event: 'made-up' })
    server.error(new Error(PLANTED))
    server.info(`Server listening at http://${PLANTED}:4380`)
    server.trace({ err: new Error(PLANTED) }, 'client error')

    expect(log.lines()).toEqual([
      { time: expect.any(String), level: 'warn', event: 'unlisted' },
      { time: expect.any(String), level: 'error', event: 'unlisted' },
      { time: expect.any(String), level: 'error', event: 'unlisted', kind: 'Error' },
    ])
    expect(log.text()).not.toContain(PLANTED)
  })

  test("an error's kind and code only in the shape an identifier has", () => {
    // Both are what the thrown error calls itself. A name or a code that is not an
    // identifier is not one, and could be anything.
    const log = capture()
    const server = createServerLog(log.sink, 'trace')
    server.error({
      event: 'outbox.failed',
      err: Object.assign(new Error('x'), { name: `${PLANTED}@example.ch`, code: `${PLANTED} with spaces` }),
    })
    server.error({ event: 'outbox.failed', err: Object.assign(new Error('x'), { code: 'ECONNREFUSED' }) })
    server.error({ event: 'outbox.failed', err: PLANTED })

    expect(log.lines()).toEqual([
      { time: expect.any(String), level: 'error', event: 'outbox.failed', kind: 'Error' },
      { time: expect.any(String), level: 'error', event: 'outbox.failed', kind: 'Error', code: 'ECONNREFUSED' },
      { time: expect.any(String), level: 'error', event: 'outbox.failed' },
    ])
    expect(log.text()).not.toContain(PLANTED)
  })

  test("the database's notices by their code, never their words, and only its warnings above debug", () => {
    // The driver prints every notice whole to standard output unless it is given somewhere
    // else to put it — the bootstrap draws them on every start — outside any rule, and a
    // notice's words can quote what it is about.
    const notices = (level: LogLevel) => {
      const log = capture()
      const said = databaseNotices(createServerLog(log.sink, level))
      said({ severity: 'NOTICE', code: '42701', message: `column "${PLANTED}" already exists, skipping` })
      said({ severity: 'WARNING', code: '25P01', message: `there is no transaction in progress: ${PLANTED}` })
      return log
    }

    expect(notices('debug').lines()).toEqual([
      { time: expect.any(String), level: 'debug', event: 'database.notice', code: '42701' },
      { time: expect.any(String), level: 'warn', event: 'database.notice', code: '25P01' },
    ])
    expect(notices('info').lines()).toEqual([
      { time: expect.any(String), level: 'warn', event: 'database.notice', code: '25P01' },
    ])
    expect(notices('debug').text()).not.toContain(PLANTED)
  })

  test('a child keeps the request id it is bound to, and nothing else', () => {
    // Fastify binds each request's log to its id; anything else bound beside it would be
    // written on every line that request writes.
    const log = capture()
    const server = createServerLog(log.sink, 'trace')
    server.child({ reqId: 'req-9', email: PLANTED }).error({ event: 'outbox.failed' })
    server.child({ reqId: PLANTED + '@example.ch' }).error({ event: 'outbox.failed' })

    expect(log.lines()).toEqual([
      { time: expect.any(String), level: 'error', event: 'outbox.failed', reqId: 'req-9' },
      { time: expect.any(String), level: 'error', event: 'outbox.failed' },
    ])
  })
})
