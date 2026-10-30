import { PostgreSqlContainer } from '@testcontainers/postgresql'
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { Readable } from 'node:stream'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { bootstrapSchema } from './db.js'
import { createApp } from './app.js'
import { createPostgresStorage } from './postgres-storage.js'
import type { FileStore } from './file-store.js'

/**
 * A name somebody else chose, served back in a `content-disposition` header
 * ([0175](../../../docs/decisions/0175-a-name-goes-into-a-header-encoded.md)).
 *
 * A file's name is whatever its respondent called it, and is kept as given; a form's path is
 * whatever its author published it under. The name went into the header with only `"`, CR and
 * LF taken out and the path with nothing, and Node refuses a header with any character beyond a
 * tab, printable ASCII and the bytes 0x80–0xFF — so a name outside Latin-1, or with a control character in it, made the
 * download or the export a `500`, and that `500` said Node's code and sentence (0172 did not
 * reach it). Measured on 2026-10-11 against this suite's own PostgreSQL, before the change:
 * seven of the rows below were a `500` with `ERR_INVALID_CHAR` in it, and four more were
 * answered under a name that was not theirs; only `notes.pdf` was right.
 *
 * Against real PostgreSQL because what is served is what the database gave back, not what the
 * request sent: a lone surrogate, for one, does not survive the trip unchanged.
 */
let container: StartedPostgreSqlContainer
let sql: postgres.Sql
let app: FastifyInstance
let admin: Record<string, string> = {}

const bytes = new Map<string, Buffer>()
const fileStore: FileStore = {
  put: async (key, body) => {
    bytes.set(key, body)
  },
  open: async (key) => {
    const found = bytes.get(key)
    return found === undefined ? undefined : Readable.from(found)
  },
  remove: async (key) => {
    bytes.delete(key)
  },
  sizeOf: async (key) => bytes.get(key)?.byteLength,
}

/** A form with a file field that takes any file: the name is what is under test, not its type. */
const schema = {
  specVersion: '4',
  id: 'evidence',
  title: 'Evidence',
  model: { fields: [{ key: 'evidence', type: 'file', label: 'Evidence' }] },
}

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:17-alpine').start()
  sql = postgres(container.getConnectionUri())
  await bootstrapSchema(sql)
  app = await createApp(createPostgresStorage(sql), {
    authSecret: 'integration-test-secret-with-length',
    bootstrapAdmin: { email: 'root@test.ch', password: 'root-password-1' },
    submissionRateLimit: { max: 10_000, timeWindowMs: 60_000 },
    loginRateLimit: { max: 10_000, timeWindowMs: 60_000 },
    fileStore,
  })
  const login = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email: 'root@test.ch', password: 'root-password-1' },
  })
  admin = { authorization: `Bearer ${login.json<{ token: string }>().token}` }
  await publish('evidence')
  const opened = await app.inject({ method: 'PUT', url: '/f/evidence/access', headers: admin, payload: { submit: 'public' } })
  expect(opened.statusCode).toBe(204)
}, 180_000)

afterAll(async () => {
  await app?.close()
  await sql?.end()
  await container?.stop()
})

async function publish(path: string): Promise<void> {
  const published = await app.inject({ method: 'POST', url: '/forms', headers: admin, payload: { path, schema } })
  expect(published.statusCode).toBe(201)
}

/** Offered and sent under `name`, as a respondent's browser would; returns its id. */
async function uploaded(name: string, body: Buffer): Promise<string> {
  const offered = await app.inject({
    method: 'POST',
    url: '/f/evidence/files',
    payload: { field: 'evidence', name, size: body.byteLength, contentType: 'application/pdf' },
  })
  expect(offered.statusCode).toBe(201)
  const file = offered.json<{ id: string; uploadUrl: string }>()
  const put = await app.inject({ method: 'PUT', url: file.uploadUrl, headers: { 'content-type': 'application/pdf' }, payload: body })
  expect(put.statusCode).toBe(204)
  return file.id
}

describe('a file, downloaded under the name its respondent gave it', () => {
  test.each([
    // An ordinary name keeps the header it always had.
    ['notes.pdf', 'attachment; filename="notes.pdf"'],
    // Outside Latin-1: a 500 that said `ERR_INVALID_CHAR`.
    ['日本 €.pdf', `attachment; filename="__ _.pdf"; filename*=UTF-8''%E6%97%A5%E6%9C%AC%20%E2%82%AC.pdf`],
    // A control character, which a respondent's own script can send: the same 500.
    ['a\u0001b.pdf', `attachment; filename="a_b.pdf"; filename*=UTF-8''a%01b.pdf`],
    // DEL: the same 500.
    ['a\u007fb.pdf', `attachment; filename="a_b.pdf"; filename*=UTF-8''a%7Fb.pdf`],
    // A Latin-1 letter: a 200 whose name was one raw byte after the stream, which `fetch` read
    // as `café`; nothing said it was Latin-1.
    ['café.pdf', `attachment; filename="caf_.pdf"; filename*=UTF-8''caf%C3%A9.pdf`],
    // A quote and a line break: answered, under a name with them deleted.
    ['a"b\r\n.pdf', `attachment; filename="a_b__.pdf"; filename*=UTF-8''a%22b%0D%0A.pdf`],
    // A lone surrogate is stored as U+FFFD, which is outside Latin-1: the same 500.
    ['\ud800.pdf', `attachment; filename="_.pdf"; filename*=UTF-8''%EF%BF%BD.pdf`],
  ])('%j is answered with its bytes and its name, encoded', async (name, disposition) => {
    const body = Buffer.from(`%PDF-1.4 ${name}`)
    const id = await uploaded(name, body)

    const downloaded = await app.inject({ method: 'GET', url: `/f/evidence/files/${id}`, headers: admin })

    expect({ status: downloaded.statusCode, disposition: downloaded.headers['content-disposition'] }).toEqual({
      status: 200,
      disposition,
    })
    expect(downloaded.rawPayload.equals(body)).toBe(true)
    // Still an attachment, never inline: what the name is does not change how it is served.
    expect(downloaded.headers['x-content-type-options']).toBe('nosniff')
    expect(String(downloaded.headers['content-type'])).toBe('application/octet-stream')
  })
})

describe("a form's submissions, exported under the form's path", () => {
  test.each([
    // A path with a line break in it, which `POST /forms` takes: a 500 that said `ERR_INVALID_CHAR`.
    ['line\nbreak', `attachment; filename="line_break-submissions.csv"; filename*=UTF-8''line%0Abreak-submissions.csv`],
    // Outside Latin-1: the same 500.
    ['日本', `attachment; filename="__-submissions.csv"; filename*=UTF-8''%E6%97%A5%E6%9C%AC-submissions.csv`],
    // A control character: the same 500.
    ['a\u0001b', `attachment; filename="a_b-submissions.csv"; filename*=UTF-8''a%01b-submissions.csv`],
    // A quote, which nothing took out here: a 200 whose header ended the name at it.
    ['a"b', `attachment; filename="a_b-submissions.csv"; filename*=UTF-8''a%22b-submissions.csv`],
    // A Latin-1 letter: a 200 whose name went out as its two UTF-8 bytes before the string
    // body, which `fetch` read as `cafÃ©`.
    ['café', `attachment; filename="caf_-submissions.csv"; filename*=UTF-8''caf%C3%A9-submissions.csv`],
  ])('%j is answered with its CSV and its name, encoded', async (path, disposition) => {
    await publish(path)

    const exported = await app.inject({
      method: 'GET',
      url: `/f/${encodeURIComponent(path)}/submissions/export.csv`,
      headers: admin,
    })

    expect({ status: exported.statusCode, disposition: exported.headers['content-disposition'] }).toEqual({
      status: 200,
      disposition,
    })
    expect(exported.body.split('\n')[0]).toBe('id,submittedAt,version,evidence')
  })
})
