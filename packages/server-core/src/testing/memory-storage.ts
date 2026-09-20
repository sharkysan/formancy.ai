import type { ApiKeyRecord, DraftRecord, FormRecord, FormVersionRecord, Storage, SubmissionRecord, UserRecord } from '../ports.js'

/**
 * The in-memory Storage — the second implementation that keeps the port
 * honest, and the one unit tests run against. Deliberately dumb: Maps and
 * scans, no cleverness to accidentally diverge from SQL semantics.
 */
export function createMemoryStorage(): Storage {
  const forms = new Map<string, FormRecord>()
  const versions = new Map<string, FormVersionRecord>()
  const submissions: SubmissionRecord[] = []
  const drafts = new Map<string, DraftRecord>()
  const users = new Map<string, UserRecord>()
  const apiKeys = new Map<string, ApiKeyRecord>()

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

    insertSubmission: async (record) => {
      submissions.push({ ...record })
    },

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
