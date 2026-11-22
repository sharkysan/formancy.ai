import { afterEach, describe, expect, test } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { createMemoryStorage } from '@formancy/server-core'
import type { Storage } from '@formancy/server-core'
import { schemaHash } from '@formancy/spec'
import type { FormSchema } from '@formancy/spec'
import { createApp, SCHEMA_HASH_HEADER, SUBMISSION_TOKEN_HEADER } from './app.js'
import type { LogSink } from './server-log.js'

/**
 * A version published before 0240 whose computed rules loop through a repeater inside a group.
 *
 * Every release through 0.14.0 published it: a read of the rows was cut to the group's name, so
 * the loop was not seen. The engine refuses it now, and a stored version is immutable, so what a
 * deployment does with one after the upgrade is what `MIGRATIONS.md` tells an operator. These hold
 * that sentence to the server rather than to the reasoning behind it.
 */
let app: FastifyInstance | undefined

afterEach(async () => {
  await app?.close()
  app = undefined
})

const ROOT = { email: 'root@test.ch', password: 'root-password-1' }

/** The nested loop: a row's member reads `first`, and `first` reads the first row's member. */
const looping = {
  specVersion: '4',
  id: 'orders',
  title: 'Orders',
  model: {
    fields: [
      {
        key: 'order',
        type: 'group',
        label: 'Order',
        fields: [
          {
            key: 'lines',
            type: 'repeater',
            label: 'Lines',
            fields: [
              { key: 'qty', type: 'number', label: 'Quantity' },
              { key: 'twice', type: 'number', label: 'Twice' },
            ],
          },
        ],
      },
      { key: 'first', type: 'number', label: 'First' },
    ],
  },
  logic: {
    rules: [
      { target: 'order.lines[].twice', kind: 'computed', cel: 'item.qty * 2.0 + first' },
      { target: 'first', kind: 'computed', cel: 'size(order.lines) == 0 ? 1.0 : order.lines[0].twice' },
    ],
  },
} as unknown as FormSchema

async function serve(storage: Storage) {
  const written: string[] = []
  const sink: LogSink = { write: (line: string) => void written.push(line) }
  app = await createApp(storage, { authSecret: 'a-test-secret-that-is-long-enough-to-sign', bootstrapAdmin: ROOT, log: { sink, level: 'info' } })
  const { token } = (await app.inject({ method: 'POST', url: '/auth/login', payload: ROOT })).json<{ token: string }>()
  return { app, asRoot: { authorization: `Bearer ${token}` }, lines: () => written.map((line) => JSON.parse(line) as Record<string, unknown>) }
}

/** The version as an earlier release stored it, put straight into the storage: no route publishes one now. */
async function storedBefore(storage: Storage): Promise<void> {
  await storage.publishVersion({
    form: { id: 'form-orders', path: 'orders', currentVersionId: null, accessSubmit: 'public', allowedOrigins: null },
    version: { id: 'version-orders', formId: 'form-orders', version: 1, schema: looping, schemaHash: schemaHash(looping) },
  })
}

describe('a stored version whose rules loop through a repeater inside a group', () => {
  test('answers its public read, and every submission with a 500 and a line at error', async () => {
    // The read hands out the document, which a browser then cannot open; the submission builds
    // the engine for the replay, which refuses the version, and nothing is stored.
    const storage = createMemoryStorage()
    await storedBefore(storage)
    const { app, asRoot, lines } = await serve(storage)

    const read = await app.inject({ method: 'GET', url: '/f/orders' })
    expect(read.statusCode).toBe(200)
    const { schemaHash: hash, submissionToken } = read.json<{ schemaHash: string; submissionToken: string }>()
    const posted = await app.inject({
      method: 'POST',
      url: '/f/orders/submissions',
      headers: { [SCHEMA_HASH_HEADER]: hash, [SUBMISSION_TOKEN_HEADER]: submissionToken },
      payload: { order: { lines: [{ qty: 2 }] } },
    })

    expect(posted.statusCode).toBe(500)
    expect(lines().some((line) => line['level'] === 'error' && line['status'] === 500)).toBe(true)
    expect((await app.inject({ method: 'GET', url: '/f/orders/submissions', headers: asRoot })).json()).toEqual({ submissions: [] })
  })

  test('is found by publishing the form again, which is refused with the cycle and keeps the version', async () => {
    // What `MIGRATIONS.md` tells an operator to do: an unchanged document is compiled again before
    // the server compares it with the one it holds, so the loop is named and nothing is replaced.
    const storage = createMemoryStorage()
    await storedBefore(storage)
    const { app, asRoot } = await serve(storage)

    const again = await app.inject({ method: 'POST', url: '/forms', headers: asRoot, payload: { path: 'orders', schema: looping } })

    expect(again.statusCode).toBe(422)
    expect(again.json()).toMatchObject({ error: 'invalid_logic' })
    expect(JSON.stringify(again.json())).toContain('Dependency cycle: order.lines[].twice -> first -> order.lines[].twice')
    expect((await app.inject({ method: 'GET', url: '/f/orders' })).json()).toMatchObject({ version: 1 })
  })
})
