import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
import { afterAll, describe, expect, test } from 'vitest'
import { createPostgresStorage } from './postgres-storage.js'

/**
 * A lookup by a value from a request that no row can hold, without a database (0172, 0173).
 *
 * The storage over a PostgreSQL nobody is listening for: a lookup that asks it fails at once,
 * so one that answers has not asked. What the lookups answer on real SQL is
 * `server.integration.test.ts`'s and `nul-character.integration.test.ts`'s.
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

describe('a value with a NUL character in it', () => {
  test('names no form, user, key or draft, and the database is not asked', async () => {
    // Asked, PostgreSQL refuses a NUL in a `text` value — `22021`, a 500 — where the in-memory
    // storage finds no such row (0173). A form's path arrives in the URL of the public read,
    // which no limit counts; an API key's prefix in a header; a draft's id in a URL.
    await expect(storage.getFormByPath('contact\u0000-us')).resolves.toBeUndefined()
    await expect(storage.getUserByEmail('root@test.ch\u0000')).resolves.toBeUndefined()
    await expect(storage.findApiKeysByPrefix('fmc_\u0000abcdefg')).resolves.toEqual([])
    await expect(storage.getDraft(randomUUID(), 'draft\u0000')).resolves.toBeUndefined()
  })

  test('is the only value answered without asking: one without is looked up', async () => {
    // The guard on the guard, as above: a storage that answered every lookup without a
    // database would pass the case before this one.
    await expect(storage.getFormByPath('contact-us')).rejects.toThrow()
    await expect(storage.getUserByEmail('root@test.ch')).rejects.toThrow()
    await expect(storage.findApiKeysByPrefix('fmc_abcdefgh')).rejects.toThrow()
    await expect(storage.getDraft(randomUUID(), 'draft')).rejects.toThrow()
  })
})
