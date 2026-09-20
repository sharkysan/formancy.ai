import { and, desc, eq, max } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import type postgres from 'postgres'
import type { FormSchema } from '@formancy/spec'
import type { Role, Storage } from '@formancy/server-core'
import { apiKeys, drafts, forms, formVersions, submissions } from './db.js'
import { users } from './db.js'

/** The Storage port over Postgres — the mirror of server-core's in-memory one. */
export function createPostgresStorage(sql: postgres.Sql): Storage {
  const db = drizzle(sql)

  return {
    async getFormByPath(path) {
      const rows = await db.select().from(forms).where(eq(forms.path, path)).limit(1)
      const row = rows[0]
      if (row === undefined) return undefined
      return { id: row.id, path: row.path, currentVersionId: row.currentVersionId }
    },

    async listForms() {
      const rows = await db.select().from(forms)
      return rows.map((row) => ({
        id: row.id,
        path: row.path,
        currentVersionId: row.currentVersionId,
      }))
    },

    async createForm(record) {
      await db.insert(forms).values({
        id: record.id,
        path: record.path,
        currentVersionId: record.currentVersionId,
      })
    },

    async setCurrentVersion(formId, versionId) {
      await db.update(forms).set({ currentVersionId: versionId }).where(eq(forms.id, formId))
    },

    async insertVersion(record) {
      await db.insert(formVersions).values({
        id: record.id,
        formId: record.formId,
        version: record.version,
        schema: record.schema,
        schemaHash: record.schemaHash,
      })
    },

    async getVersionById(id) {
      const rows = await db.select().from(formVersions).where(eq(formVersions.id, id)).limit(1)
      const row = rows[0]
      if (row === undefined) return undefined
      return {
        id: row.id,
        formId: row.formId,
        version: row.version,
        schema: row.schema as FormSchema,
        schemaHash: row.schemaHash,
      }
    },

    async findVersionByHash(formId, schemaHash) {
      const rows = await db
        .select()
        .from(formVersions)
        .where(eq(formVersions.formId, formId))
      const row = rows.find((candidate) => candidate.schemaHash === schemaHash)
      if (row === undefined) return undefined
      return {
        id: row.id,
        formId: row.formId,
        version: row.version,
        schema: row.schema as FormSchema,
        schemaHash: row.schemaHash,
      }
    },

    async latestVersionNumber(formId) {
      const rows = await db
        .select({ latest: max(formVersions.version) })
        .from(formVersions)
        .where(eq(formVersions.formId, formId))
      return rows[0]?.latest ?? 0
    },

    async insertSubmission(record) {
      await db.insert(submissions).values({
        id: record.id,
        formId: record.formId,
        formVersionId: record.formVersionId,
        data: record.data,
        submittedAt: new Date(record.submittedAt),
      })
    },

    async listSubmissions() {
      const rows = await db.select().from(submissions)
      return rows.map(toSubmissionRecord)
    },

    async listSubmissionsByForm(formId) {
      const rows = await db
        .select()
        .from(submissions)
        .where(eq(submissions.formId, formId))
        .orderBy(desc(submissions.submittedAt), desc(submissions.id))
      return rows.map(toSubmissionRecord)
    },

    async listVersionsByForm(formId) {
      const rows = await db
        .select()
        .from(formVersions)
        .where(eq(formVersions.formId, formId))
        .orderBy(desc(formVersions.version))
      return rows.map((row) => ({
        id: row.id,
        formId: row.formId,
        version: row.version,
        schema: row.schema as FormSchema,
        schemaHash: row.schemaHash,
      }))
    },

    async upsertDraft(record) {
      await db
        .insert(drafts)
        .values({
          id: record.id,
          formId: record.formId,
          formVersionId: record.formVersionId,
          data: record.data,
          updatedAt: new Date(record.updatedAt),
        })
        .onConflictDoUpdate({
          target: [drafts.formId, drafts.id],
          set: {
            formVersionId: record.formVersionId,
            data: record.data,
            updatedAt: new Date(record.updatedAt),
          },
        })
    },

    async getDraft(formId, draftId) {
      const rows = await db
        .select()
        .from(drafts)
        .where(and(eq(drafts.formId, formId), eq(drafts.id, draftId)))
        .limit(1)
      const row = rows[0]
      if (row === undefined) return undefined
      return {
        id: row.id,
        formId: row.formId,
        formVersionId: row.formVersionId,
        data: row.data,
        updatedAt: row.updatedAt.toISOString(),
      }
    },

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
      const rows = await db.select().from(apiKeys).where(eq(apiKeys.prefix, prefix))
      return rows.map(toApiKeyRecord)
    },

    async revokeApiKey(id, atIso) {
      await db.update(apiKeys).set({ revokedAt: new Date(atIso) }).where(eq(apiKeys.id, id))
    },
  }
}

function toApiKeyRecord(row: {
  id: string
  name: string
  prefix: string
  secretHash: string
  role: string
  createdAt: Date
  revokedAt: Date | null
}) {
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

function toSubmissionRecord(row: {
  id: string
  formId: string
  formVersionId: string
  data: unknown
  submittedAt: Date
}) {
  return {
    id: row.id,
    formId: row.formId,
    formVersionId: row.formVersionId,
    data: row.data,
    submittedAt: row.submittedAt.toISOString(),
  }
}
