import type { FormRecord, FormVersionRecord, Storage, SubmissionRecord } from '../ports.js'

/**
 * The in-memory Storage — the second implementation that keeps the port
 * honest, and the one unit tests run against. Deliberately dumb: Maps and
 * scans, no cleverness to accidentally diverge from SQL semantics.
 */
export function createMemoryStorage(): Storage {
  const forms = new Map<string, FormRecord>()
  const versions = new Map<string, FormVersionRecord>()
  const submissions: SubmissionRecord[] = []

  return {
    getFormByPath: async (path) => [...forms.values()].find((form) => form.path === path),

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
  }
}
