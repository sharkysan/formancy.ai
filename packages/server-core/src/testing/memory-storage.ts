import type { AuditEntry } from '../audit.js'
import type {
  DeliveryRecord,
  WebhookRecord, ApiKeyRecord, DraftRecord, FileRecord, FormRecord, FormVersionRecord, Storage, SubmissionRecord, UserRecord } from '../ports.js'

/**
 * The in-memory Storage — the second implementation that keeps the port
 * honest, and the one unit tests run against. Deliberately dumb: Maps and
 * scans, no cleverness to accidentally diverge from SQL semantics.
 */
export function createMemoryStorage(): Storage {
  const forms = new Map<string, FormRecord>()
  const webhooks = new Map<string, WebhookRecord>()
  const deliveries = new Map<string, DeliveryRecord>()
  const versions = new Map<string, FormVersionRecord>()
  const submissions: SubmissionRecord[] = []
  const audits: AuditEntry[] = []
  const drafts = new Map<string, DraftRecord>()
  const users = new Map<string, UserRecord>()
  const apiKeys = new Map<string, ApiKeyRecord>()
  const files = new Map<string, FileRecord>()

  return {
    getFormByPath: async (path) => [...forms.values()].find((form) => form.path === path),

    listForms: async () => [...forms.values()].map((form) => ({ ...form })),

    updateFormAccess: async (formId, access) => {
      const form = forms.get(formId)
      if (form !== undefined) forms.set(formId, { ...form, ...access })
    },

    createForm: async (record) => {
      forms.set(record.id, { ...record })
    },

    setCurrentVersion: async (formId, versionId) => {
      const form = forms.get(formId)
      if (form === undefined) throw new Error(`No form "${formId}"`)
      form.currentVersionId = versionId
    },

    insertVersion: async (record) => {
      versions.set(record.id, { ...record })
    },

    getVersionById: async (id) => versions.get(id),

    findVersionByHash: async (formId, hash) =>
      [...versions.values()].find(
        (version) => version.formId === formId && version.schemaHash === hash,
      ),

    latestVersionNumber: async (formId) =>
      Math.max(
        0,
        ...[...versions.values()]
          .filter((version) => version.formId === formId)
          .map((version) => version.version),
      ),

    webhooksForForm: async (formId) =>
      [...webhooks.values()].filter((hook) => hook.formId === formId).map((hook) => ({ ...hook })),

    insertWebhook: async (record) => {
      webhooks.set(record.id, { ...record })
    },

    claimDueDeliveries: async (nowIso, limit) =>
      [...deliveries.values()]
        .filter((entry) => entry.state === 'pending' && entry.nextAttemptAt <= nowIso)
        .sort((a, b) => a.nextAttemptAt.localeCompare(b.nextAttemptAt))
        .slice(0, limit)
        .map((entry) => ({ ...entry })),

    updateDelivery: async (record) => {
      deliveries.set(record.id, { ...record })
    },

    insertFile: async (record) => {
      files.set(record.id, { ...record })
    },

    getFile: async (id) => {
      const found = files.get(id)
      return found === undefined ? undefined : { ...found }
    },

    updateFile: async (record) => {
      files.set(record.id, { ...record })
    },

    // A claimed file belongs to a submission and is never rubbish, however
    // old. Age is a reason to collect an unclaimed one, never a claimed one.
    abandonedFiles: async (beforeIso) =>
      [...files.values()]
        .filter((file) => file.state !== 'claimed' && file.createdAt < beforeIso)
        .map((file) => ({ ...file })),

    deleteFiles: async (ids) => {
      for (const id of ids) files.delete(id)
    },

    insertSubmission: async (record, queued, claimFileIds, audit) => {
      // One step, like the real transaction it stands in for: both land or
      // neither does.
      submissions.push({ ...record })
      for (const delivery of queued ?? []) deliveries.set(delivery.id, { ...delivery })
      for (const id of claimFileIds ?? []) {
        const file = files.get(id)
        // Same call, same commit: a submission exists if and only if the
        // files it names belong to it.
        if (file !== undefined) {
          files.set(id, { ...file, state: 'claimed', submissionId: record.id })
        }
      }
      // Same commit again: a submission that rolled back must leave no trace
      // saying it happened.
      if (audit !== undefined) audits.push({ ...audit })
    },

    recordAudit: async (entry) => {
      audits.push({ ...entry })
    },

    listAudit: async (limit) => [...audits].reverse().slice(0, limit),

    listSubmissions: async () => [...submissions],

    listSubmissionsByForm: async (formId) =>
      submissions.filter((record) => record.formId === formId).reverse(),

    listVersionsByForm: async (formId) =>
      [...versions.values()]
        .filter((version) => version.formId === formId)
        .sort((a, b) => b.version - a.version),

    upsertDraft: async (record) => {
      drafts.set(record.formId + ':' + record.id, { ...record })
    },

    getDraft: async (formId, draftId) => drafts.get(formId + ':' + draftId),

    insertUser: async (record) => {
      users.set(record.id, { ...record })
    },

    getUserByEmail: async (email) =>
      [...users.values()].find((user) => user.email === email),

    insertApiKey: async (record) => {
      apiKeys.set(record.id, { ...record })
    },

    listApiKeys: async () => [...apiKeys.values()].map((key) => ({ ...key })),

    findApiKeysByPrefix: async (prefix) =>
      [...apiKeys.values()].filter((key) => key.prefix === prefix),

    revokeApiKey: async (id, atIso) => {
      const key = apiKeys.get(id)
      if (key !== undefined) key.revokedAt = atIso
    },
  }
}
