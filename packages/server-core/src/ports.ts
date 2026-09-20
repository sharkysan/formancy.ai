import type { FormSchema } from '@formancy/spec'
import type { Role } from './auth.js'

/**
 * The storage port. Implemented over Postgres in @formancy/server and over a
 * Map in tests — the use-cases cannot tell the difference, which is what makes
 * them testable without a database and portable across ones.
 */
export interface FormRecord {
  id: string
  path: string
  currentVersionId: string | null
}

export interface FormVersionRecord {
  id: string
  formId: string
  version: number
  schema: FormSchema
  schemaHash: string
}

export interface SubmissionRecord {
  id: string
  formId: string
  formVersionId: string
  data: unknown
  submittedAt: string
}

export interface UserRecord {
  id: string
  email: string
  passwordHash: string
  role: Role
  createdAt: string
}

export interface ApiKeyRecord {
  id: string
  name: string
  /** The visible first characters — index and display, never authentication. */
  prefix: string
  secretHash: string
  role: Role
  createdAt: string
  revokedAt: string | null
}

export interface DraftRecord {
  id: string
  formId: string
  formVersionId: string
  data: unknown
  updatedAt: string
}

export interface Storage {
  getFormByPath(path: string): Promise<FormRecord | undefined>
  listForms(): Promise<FormRecord[]>
  createForm(record: FormRecord): Promise<void>
  setCurrentVersion(formId: string, versionId: string): Promise<void>
  insertVersion(record: FormVersionRecord): Promise<void>
  getVersionById(id: string): Promise<FormVersionRecord | undefined>
  findVersionByHash(formId: string, schemaHash: string): Promise<FormVersionRecord | undefined>
  latestVersionNumber(formId: string): Promise<number>
  insertSubmission(record: SubmissionRecord): Promise<void>
  listSubmissions(): Promise<SubmissionRecord[]>
  /** Newest first. */
  listSubmissionsByForm(formId: string): Promise<SubmissionRecord[]>
  listVersionsByForm(formId: string): Promise<FormVersionRecord[]>
  upsertDraft(record: DraftRecord): Promise<void>
  getDraft(formId: string, draftId: string): Promise<DraftRecord | undefined>
  insertUser(record: UserRecord): Promise<void>
  getUserByEmail(email: string): Promise<UserRecord | undefined>
  insertApiKey(record: ApiKeyRecord): Promise<void>
  listApiKeys(): Promise<ApiKeyRecord[]>
  findApiKeysByPrefix(prefix: string): Promise<ApiKeyRecord[]>
  revokeApiKey(id: string, atIso: string): Promise<void>
}
