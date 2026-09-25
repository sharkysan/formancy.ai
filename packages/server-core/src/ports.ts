import type { AuditEntry } from './audit.js'
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
  /**
   * Who may submit. Deliberately NOT part of the form document: a document has
   * to mean the same thing wherever it is moved, and carrying "anyone may
   * submit this" across a deployment boundary is how a private form becomes a
   * public one by accident.
   *
   * Defaults to `authenticated`. The safe value is the default because the
   * unsafe one should require somebody to have said it.
   */
  accessSubmit: 'authenticated' | 'public'
  /**
   * Origins allowed to submit anonymously. `null` means no allowlist is in
   * force; an empty array means nothing is allowed, which is not the same
   * thing and is why this is not just an array.
   */
  allowedOrigins: string[] | null
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

/** A webhook registered against a form. */
export interface WebhookRecord {
  id: string
  formId: string
  url: string
  /** Shared with the receiver; signs every delivery. */
  secret: string
  /**
   * Failures in a row against this destination. Reset by any success.
   *
   * On the record rather than in the worker's memory for two reasons: memory
   * does not survive a restart, and a self-hoster with no operations team
   * needs a failing webhook to be visible on a screen rather than in a log
   * nobody is tailing.
   */
  consecutiveFailures: number
  /** When the breaker opened, or null while the destination is answering. */
  openedAt: string | null
}

/**
 * One queued delivery — the outbox row.
 *
 * It exists so that "a submission was accepted" and "its webhooks will be
 * delivered" are decided by the same COMMIT. The alternative, posting after
 * the insert returns, produces the two failures a self-hoster cannot debug:
 * the webhook fired and the submission rolled back, or the submission is
 * stored and nothing was ever sent.
 */
export interface DeliveryRecord {
  id: string
  webhookId: string
  submissionId: string
  /** Stable across every retry, so a receiver can be idempotent. */
  eventId: string
  body: string
  attempt: number
  /** Not before this instant. Set by the retry schedule. */
  nextAttemptAt: string
  /** `pending`, `delivered`, or `dead` once the attempts run out. */
  state: 'pending' | 'delivered' | 'dead'
  lastError: string | null
}

/**
 * One uploaded file, in three states.
 *
 * `offered` means somebody asked where to put a file and the bytes have not
 * arrived. `stored` means they have. `claimed` means a submission that
 * references it was accepted, which is the only state that makes a file worth
 * keeping — everything else is rubbish waiting to be collected.
 *
 * The row is written BEFORE the bytes, so a file that dies halfway through
 * uploading is still something the collector knows to look for. An orphan on
 * disk with no row is one nothing will ever find.
 *
 * `name` is what the reader called it and is shown back to them; it is never
 * part of `storageKey`, because a key built from a submitted filename is a
 * path traversal waiting for somebody to try it.
 */
export interface FileRecord {
  id: string
  formId: string
  /** What the reader called it. Display only. */
  name: string
  size: number
  contentType: string
  /** Where the bytes are, in whatever the host's storage calls a location. */
  storageKey: string
  state: 'offered' | 'stored' | 'claimed'
  createdAt: string
  /** The submission that claimed it, or null. One file, one submission. */
  submissionId: string | null
}

export interface Storage {
  getFormByPath(path: string): Promise<FormRecord | undefined>
  listForms(): Promise<FormRecord[]>
  createForm(record: FormRecord): Promise<void>
  updateFormAccess(
    formId: string,
    access: Pick<FormRecord, 'accessSubmit' | 'allowedOrigins'>,
  ): Promise<void>
  setCurrentVersion(formId: string, versionId: string): Promise<void>
  insertVersion(record: FormVersionRecord): Promise<void>

  /**
   * A publish, as ONE commit.
   *
   * The three steps it replaces — create the form when it is new, insert the
   * version, point the form at it — used to be three calls, and the middle
   * failure is the one that hurts: a form row whose `currentVersionId` is
   * still null resolves to nothing, so the form exists, answers its URL, and
   * has no schema to render. `GET /f/:path` 404s for a form that is right
   * there in the list.
   *
   * The audit row travels with them for the same reason it travels with a
   * submission: a publish that rolled back must leave nothing saying it
   * happened, and a publish that happened must leave something.
   *
   * `form` is present only when the form is new. An existing form is not
   * touched apart from its pointer, because its access settings are not the
   * publisher's business.
   */
  publishVersion(input: {
    form?: FormRecord
    version: FormVersionRecord
    audit?: AuditEntry
  }): Promise<void>
  getVersionById(id: string): Promise<FormVersionRecord | undefined>
  findVersionByHash(formId: string, schemaHash: string): Promise<FormVersionRecord | undefined>
  latestVersionNumber(formId: string): Promise<number>
  /**
   * The submission and every delivery it triggers, in ONE transaction.
   *
   * One method rather than two calls, because the atomicity is the point and a
   * port that exposes them separately invites a caller to break it. See
   * docs/decisions/0024-postgres-over-mongodb.md, where this requirement is
   * what chose the database.
   */
  /**
   * The submission, the webhooks it triggers and the files it claims, in ONE
   * call because they belong in one COMMIT. A port that exposed them
   * separately would invite a caller to break that, and the three failures it
   * prevents — a webhook fired for a rolled-back submission, a stored
   * submission nothing was sent about, an accepted submission whose files the
   * collector deletes — are the ones a self-hoster cannot debug.
   */
  insertSubmission(
    record: SubmissionRecord,
    deliveries?: readonly DeliveryRecord[],
    claimFileIds?: readonly string[],
    audit?: AuditEntry,
  ): Promise<void>

  /**
   * Append one audit row.
   *
   * Append-only by contract, and the deployment is expected to back that with
   * a database role holding INSERT and SELECT and nothing else — an audit
   * log the application can edit is a log that says whatever the person who
   * broke in wants it to say. There is deliberately no update and no delete
   * on this port for anything to call.
   *
   * For a mutation that HAS a transaction, pass the entry to that call
   * instead, so the row and the thing it describes commit together. See
   * `insertSubmission`.
   */
  recordAudit(entry: AuditEntry): Promise<void>

  /** Newest first. Reading the log is itself a management-plane action. */
  listAudit(limit: number): Promise<AuditEntry[]>

  /**
   * Spend a solved challenge, once.
   *
   * Returns false when it has been spent already. The signature on a challenge
   * proves this server minted it and the hash proves somebody did the work —
   * and neither stops the same correct solution being sent a thousand times,
   * because a correct solution stays correct. Only a record of what has been
   * used can.
   *
   * It must be ATOMIC: two requests arriving with one solution both pass every
   * stateless check, and the database is the only thing that can decide which
   * of them spends it. An implementation that reads then writes has a race
   * exactly where the attacker is looking.
   */
  spendChallenge(challenge: string, expiresAtIso: string): Promise<boolean>

  /** Drop spent challenges that can no longer be replayed anyway. */
  forgetExpiredChallenges(beforeIso: string): Promise<number>

  insertFile(record: FileRecord): Promise<void>
  getFile(id: string): Promise<FileRecord | undefined>
  updateFile(record: FileRecord): Promise<void>
  /** Every file in a state other than `claimed`, created before `beforeIso`. */
  abandonedFiles(beforeIso: string): Promise<FileRecord[]>
  deleteFiles(ids: readonly string[]): Promise<void>
  webhooksForForm(formId: string): Promise<WebhookRecord[]>
  insertWebhook(record: WebhookRecord): Promise<void>
  /** Health, after an attempt. The record is the breaker's only memory. */
  updateWebhook(record: WebhookRecord): Promise<void>
  listWebhooks(): Promise<WebhookRecord[]>
  /**
   * Deliveries that ran out of attempts.
   *
   * Dead, not deleted: the row is the evidence that something was supposed to
   * be sent and never arrived. Without a way to list them the evidence is in
   * a table nobody looks at, which is the same as not having it.
   */
  deadDeliveries(limit: number): Promise<DeliveryRecord[]>
  getDelivery(id: string): Promise<DeliveryRecord | undefined>
  /** Oldest first, only those due. */
  claimDueDeliveries(nowIso: string, limit: number): Promise<DeliveryRecord[]>
  updateDelivery(record: DeliveryRecord): Promise<void>
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
