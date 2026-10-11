import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
import { afterAll, describe, expect, test } from 'vitest'
import { createPostgresStorage } from './postgres-storage.js'

/**
 * A lookup by an id from a URL, without a database (0172).
 *
 * The storage over a PostgreSQL nobody is listening for: a lookup that asks it fails at once,
 * so one that answers has not asked. What the lookups answer on real SQL is
 * `server.integration.test.ts`'s.
 */
const sql = postgres('postgres://formancy:formancy@127.0.0.1:1/formancy', { max: 1, connect_timeout: 2 })
const storage = createPostgresStorage(sql)

afterAll(async () => {
  await sql.end({ timeout: 0 })
})

describe('an id that is not a uuid', () => {
  test('names no file and no delivery, and the database is not asked', async () => {
    // Asked, PostgreSQL refuses to compare a uuid column with it — `22P02`, a 500 — where the
    // in-memory storage finds no such row. A file's id arrives in the URL of a public route.
    await expect(storage.getFile('not-a-file-id')).resolves.toBeUndefined()
    await expect(storage.getDelivery('not-a-delivery-id')).resolves.toBeUndefined()
  })

  test('is the only id answered without asking: a uuid is looked up', async () => {
    // The guard on the guard: a storage that answered every lookup without a database would
    // pass the case above.
    await expect(storage.getFile(randomUUID())).rejects.toThrow()
    await expect(storage.getDelivery(randomUUID())).rejects.toThrow()
  })
})
