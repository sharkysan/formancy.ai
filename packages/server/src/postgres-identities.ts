import { eq } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type { Role, Storage } from '@formancy/server-core'
import { apiKeys, fitsText, users } from './db.js'

/**
 * Who may use the management plane, over PostgreSQL: users with a password and API keys, each
 * stored as a hash and looked up by what a request presents — an email, a key's prefix.
 *
 * Its own file because it changes for its own reason — the way somebody is let in, not the
 * forms and responses everything else here stores — and because `postgres-storage.ts` would
 * otherwise have crossed the size budget when its lookups learned to find nothing for a NUL
 * (0173).
 */
export function identitiesStorage(
  db: PostgresJsDatabase,
): Pick<Storage, 'insertUser' | 'getUserByEmail' | 'insertApiKey' | 'listApiKeys' | 'findApiKeysByPrefix' | 'revokeApiKey'> {
  return {
    async insertUser(record) {
      await db.insert(users).values({
        id: record.id,
        email: record.email,
        passwordHash: record.passwordHash,
        role: record.role,
        createdAt: new Date(record.createdAt),
      })
    },

    async getUserByEmail(email) {
      // An address a text column cannot hold has no account, and asking is a 22021 (0173).
      if (!fitsText(email)) return undefined
      const rows = await db.select().from(users).where(eq(users.email, email)).limit(1)
      const row = rows[0]
      if (row === undefined) return undefined
      return {
        id: row.id,
        email: row.email,
        passwordHash: row.passwordHash,
        role: row.role as Role,
        createdAt: row.createdAt.toISOString(),
      }
    },

    async insertApiKey(record) {
      await db.insert(apiKeys).values({
        id: record.id,
        name: record.name,
        prefix: record.prefix,
        secretHash: record.secretHash,
        role: record.role,
        createdAt: new Date(record.createdAt),
        revokedAt: record.revokedAt === null ? null : new Date(record.revokedAt),
      })
    },

    async listApiKeys() {
      const rows = await db.select().from(apiKeys)
      return rows.map(toApiKeyRecord)
    },

    async findApiKeysByPrefix(prefix) {
      // From a header, as anybody wrote it.
      if (!fitsText(prefix)) return []
      const rows = await db.select().from(apiKeys).where(eq(apiKeys.prefix, prefix))
      return rows.map(toApiKeyRecord)
    },

    async revokeApiKey(id, atIso) {
      await db.update(apiKeys).set({ revokedAt: new Date(atIso) }).where(eq(apiKeys.id, id))
    },
  }
}

/** An API key's row as the port describes it: timestamps as ISO strings. */
function toApiKeyRecord(row: typeof apiKeys.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    secretHash: row.secretHash,
    role: row.role as Role,
    createdAt: row.createdAt.toISOString(),
    revokedAt: row.revokedAt === null ? null : row.revokedAt.toISOString(),
  }
}
