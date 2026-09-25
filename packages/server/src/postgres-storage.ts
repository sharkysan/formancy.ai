import { and, desc, eq, inArray, lt, lte, max, ne } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import type postgres from 'postgres'
import type { FormSchema } from '@formancy/spec'
import type { AuditEntry, FileRecord, Role, Storage } from '@formancy/server-core'
import { apiKeys, auditLog, deliveries, drafts, files, forms, formVersions, submissions, webhooks } from './db.js'
import { users } from './db.js'

/** The Storage port over Postgres — the mirror of server-core's in-memory one. */
export function createPostgresStorage(sql: postgres.Sql): Storage {
  const db = drizzle(sql)

  return {
    async getFormByPath(path) {
      const rows = await db.select().from(forms).where(eq(forms.path, path)).limit(1)
      const row = rows[0]
      if (row === undefined) return undefined
      return {
        id: row.id,
        path: row.path,
        currentVersionId: row.currentVersionId,
        accessSubmit: row.accessSubmit === 'public' ? 'public' : 'authenticated',
        allowedOrigins: row.allowedOrigins,
      }
    },

    async listForms() {
      const rows = await db.select().from(forms)
      return rows.map((row) => ({
        id: row.id,
        path: row.path,
        currentVersionId: row.currentVersionId,
        accessSubmit: row.accessSubmit === 'public' ? ('public' as const) : ('authenticated' as const),
        allowedOrigins: row.allowedOrigins,
      }))
    },

    async createForm(record) {
      await db.insert(forms).values({
        id: record.id,
        path: record.path,
        currentVersionId: record.currentVersionId,
        accessSubmit: record.accessSubmit,
        allowedOrigins: record.allowedOrigins,
      })
    },

    async updateFormAccess(formId, access) {
      await db
        .update(forms)
        .set({ accessSubmit: access.accessSubmit, allowedOrigins: access.allowedOrigins })
        .where(eq(forms.id, formId))
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

    async publishVersion({ form, version, audit }) {
      // ONE transaction. Three calls left a window where the form row existed
      // with a null pointer, which is a form that answers its URL and has no
      // schema to render — present in the list, 404 when opened.
      await db.transaction(async (tx) => {
        if (form !== undefined) {
          await tx.insert(forms).values({
            id: form.id,
            path: form.path,
            currentVersionId: form.currentVersionId,
            accessSubmit: form.accessSubmit,
            allowedOrigins: form.allowedOrigins,
          })
        }

        await tx.insert(formVersions).values({
          id: version.id,
          formId: version.formId,
          version: version.version,
          schema: version.schema,
          schemaHash: version.schemaHash,
        })

        const pointed = await tx
          .update(forms)
          .set({ currentVersionId: version.id })
          .where(eq(forms.id, version.formId))
          .returning({ id: forms.id })

        // An UPDATE that matched nothing is not an error in SQL, so it has to
        // be looked at: without this, publishing to a form that has been
        // deleted underneath would insert an orphan version and report success.
        if (pointed.length !== 1) {
          throw new Error(
            `Publishing to form ${version.formId} matched no form row. Rolling back, so there is no version pointing at a form that is not there.`,
          )
        }

        if (audit !== undefined) await tx.insert(auditLog).values(auditRow(audit))
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

    async insertSubmission(record, queued, claimFileIds, audit) {
      // ONE transaction. The submission and the deliveries it triggers commit
      // together or not at all — the requirement that chose this database
      // (docs/decisions/0024-postgres-over-mongodb.md).
      await db.transaction(async (tx) => {
        await tx.insert(submissions).values({
          id: record.id,
          formId: record.formId,
          formVersionId: record.formVersionId,
          data: record.data,
          submittedAt: new Date(record.submittedAt),
        })

        if (queued !== undefined && queued.length > 0) {
          await tx.insert(deliveries).values(
            queued.map((delivery) => ({
              id: delivery.id,
              webhookId: delivery.webhookId,
              submissionId: delivery.submissionId,
              eventId: delivery.eventId,
              body: delivery.body,
              attempt: delivery.attempt,
              nextAttemptAt: new Date(delivery.nextAttemptAt),
              state: delivery.state,
              lastError: delivery.lastError,
            })),
          )
        }

        if (claimFileIds !== undefined && claimFileIds.length > 0) {
          // In the same transaction, and only from `stored`: two concurrent
          // submissions naming the same file both pass the check made outside
          // the transaction, and this is where the second one loses. The row
          // count is what says it lost — an UPDATE that matched nothing is not
          // an error in SQL, so it has to be looked at.
          const claimed = await tx
            .update(files)
            .set({ state: 'claimed', submissionId: record.id })
            .where(and(inArray(files.id, [...claimFileIds]), eq(files.state, 'stored')))
            .returning({ id: files.id })

          if (claimed.length !== claimFileIds.length) {
            throw new Error(
              'A file this submission names was claimed by another one first. Rolling back, so the submission does not reference bytes it does not own.',
            )
          }
        }

        // Last, and inside: a submission that rolled back must leave nothing
        // behind saying it happened.
        if (audit !== undefined) await tx.insert(auditLog).values(auditRow(audit))
      })
    },

    async recordAudit(entry) {
      await db.insert(auditLog).values(auditRow(entry))
    },

    async listAudit(limit) {
      const rows = await db.select().from(auditLog).orderBy(desc(auditLog.at)).limit(limit)
      return rows.map((row) => ({
        id: row.id,
        at: row.at.toISOString(),
        action: row.action as AuditEntry['action'],
        ...(row.actorKind === null ? {} : { actorKind: row.actorKind as 'user' | 'apiKey' }),
        ...(row.actorId === null ? {} : { actorId: row.actorId }),
        ...(row.subject === null ? {} : { subject: row.subject }),
        ...(row.requestId === null ? {} : { requestId: row.requestId }),
        ...(row.detail === null
          ? {}
          : { detail: row.detail as NonNullable<AuditEntry['detail']> }),
      }))
    },

    async insertFile(record) {
      await db.insert(files).values({ ...record, createdAt: new Date(record.createdAt) })
    },

    async getFile(id) {
      const [row] = await db.select().from(files).where(eq(files.id, id)).limit(1)
      return row === undefined ? undefined : toFileRecord(row)
    },

    async updateFile(record) {
      await db
        .update(files)
        .set({ state: record.state, submissionId: record.submissionId })
        .where(eq(files.id, record.id))
    },

    async abandonedFiles(beforeIso) {
      // A claimed file belongs to a submission and is never rubbish, however
      // old. Age is a reason to collect an unclaimed one, never a claimed one.
      const rows = await db
        .select()
        .from(files)
        .where(and(ne(files.state, 'claimed'), lt(files.createdAt, new Date(beforeIso))))
      return rows.map(toFileRecord)
    },

    async deleteFiles(ids) {
      if (ids.length === 0) return
      await db.delete(files).where(inArray(files.id, [...ids]))
    },

    async webhooksForForm(formId) {
      const rows = await db.select().from(webhooks).where(eq(webhooks.formId, formId))
      return rows.map(toWebhookRecord)
    },

    async insertWebhook(record) {
      // Spelled out rather than spread: `openedAt` is an ISO string on the
      // record and a timestamp in the column, and a spread would have passed
      // the string straight through.
      await db.insert(webhooks).values({
        id: record.id,
        formId: record.formId,
        url: record.url,
        secret: record.secret,
        consecutiveFailures: record.consecutiveFailures,
        openedAt: record.openedAt === null ? null : new Date(record.openedAt),
      })
    },

    async updateWebhook(record) {
      // Health only. The url and the secret are not the worker's to change,
      // and a full row update here would let a failed delivery quietly
      // rewrite where the next one goes.
      await db
        .update(webhooks)
        .set({
          consecutiveFailures: record.consecutiveFailures,
          openedAt: record.openedAt === null ? null : new Date(record.openedAt),
        })
        .where(eq(webhooks.id, record.id))
    },

    async listWebhooks() {
      const rows = await db.select().from(webhooks)
      return rows.map(toWebhookRecord)
    },

    async deadDeliveries(limit) {
      const rows = await db
        .select()
        .from(deliveries)
        .where(eq(deliveries.state, 'dead'))
        .orderBy(desc(deliveries.nextAttemptAt))
        .limit(limit)
      return rows.map(toDeliveryRecord)
    },

    async getDelivery(id) {
      const [row] = await db.select().from(deliveries).where(eq(deliveries.id, id)).limit(1)
      return row === undefined ? undefined : toDeliveryRecord(row)
    },

    async claimDueDeliveries(nowIso, limit) {
      const rows = await db
        .select()
        .from(deliveries)
        .where(and(eq(deliveries.state, 'pending'), lte(deliveries.nextAttemptAt, new Date(nowIso))))
        .orderBy(deliveries.nextAttemptAt)
        .limit(limit)
      return rows.map(toDeliveryRecord)
    },

    async updateDelivery(record) {
      await db
        .update(deliveries)
        .set({
          attempt: record.attempt,
          nextAttemptAt: new Date(record.nextAttemptAt),
          state: record.state,
          lastError: record.lastError,
        })
        .where(eq(deliveries.id, record.id))
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

/** A delivery row as the port describes it. */
function toDeliveryRecord(row: typeof deliveries.$inferSelect) {
  return {
    id: row.id,
    webhookId: row.webhookId,
    submissionId: row.submissionId,
    eventId: row.eventId,
    body: row.body,
    attempt: row.attempt,
    nextAttemptAt: row.nextAttemptAt.toISOString(),
    state: row.state as 'pending' | 'delivered' | 'dead',
    lastError: row.lastError,
  }
}

/** A files row as the port describes it: timestamps as ISO strings. */
function toFileRecord(row: typeof files.$inferSelect): FileRecord {
  return {
    id: row.id,
    formId: row.formId,
    name: row.name,
    size: row.size,
    contentType: row.contentType,
    storageKey: row.storageKey,
    state: row.state as FileRecord['state'],
    createdAt: row.createdAt.toISOString(),
    submissionId: row.submissionId,
  }
}

/** A webhook row as the port describes it, health included. */
function toWebhookRecord(row: typeof webhooks.$inferSelect) {
  return {
    id: row.id,
    formId: row.formId,
    url: row.url,
    secret: row.secret,
    consecutiveFailures: row.consecutiveFailures,
    openedAt: row.openedAt === null ? null : row.openedAt.toISOString(),
  }
}

/**
 * An entry as the table holds it.
 *
 * Absent and null are the same thing here, and the conversion is in one place
 * so two call sites cannot disagree about which they write.
 */
function auditRow(entry: AuditEntry) {
  return {
    id: entry.id,
    at: new Date(entry.at),
    action: entry.action,
    actorKind: entry.actorKind ?? null,
    actorId: entry.actorId ?? null,
    subject: entry.subject ?? null,
    requestId: entry.requestId ?? null,
    detail: entry.detail ?? null,
  }
}
