import type { Actor } from './auth.js'

/**
 * Who did what, to which thing, and when.
 *
 * **Reads and exports are recorded as well as mutations** — `submission.read` and
 * `submission.exported` — which is what lets a self-hoster answer who downloaded four
 * thousand people's answers ([0057](../../../docs/decisions/0057-the-audit-log-records-reads.md)).
 *
 * **A row joins the mutation's transaction where there is one.** `insertSubmission` and
 * `publishVersion` both commit their audit row with the change it describes, so a
 * rollback leaves no trace saying it happened. A read has nothing to be atomic with, so
 * its row is appended after the rows are handed over and a failure to write it is logged
 * loudly rather than swallowed.
 *
 * **`detail` carries identifiers and counts, never submission content.** An audit log is
 * read by more people, kept longer and exported more freely than the data it describes.
 */

/**
 * Every auditable action, as a closed list.
 *
 * Closed so a new route cannot invent its own spelling: an audit log where one event is
 * called two things is one nobody can query.
 */
export const AUDIT_ACTIONS = [
  'auth.login',
  'auth.login.failed',
  'form.published',
  'form.access.changed',
  'submission.created',
  'submission.read',
  'submission.exported',
  'file.downloaded',
  'user.created',
  'apiKey.created',
  'apiKey.revoked',
  // Somebody decided a dead delivery should go after all. Recorded because it
  // sends data to a third party on a person's say-so.
  'delivery.replayed',
  // A form's words or its document sent to the operator's model, on a person's say-so and
  // at the operator's cost. Recorded with the kind and the size, never the text (0165).
  'model.asked',
] as const

export type AuditAction = (typeof AUDIT_ACTIONS)[number]

export interface AuditEntry {
  readonly id: string
  readonly at: string
  readonly action: AuditAction
  /**
   * Who. Absent for an anonymous public submission, which is a real answer
   * rather than a gap: the form was open, and nobody was signed in.
   */
  readonly actorKind?: 'user' | 'apiKey'
  readonly actorId?: string
  /**
   * What it was done to, as a stable identifier: a form's path, a submission
   * id, a user's id. Absent only where the action has no object, which is
   * currently nothing.
   */
  readonly subject?: string
  /**
   * The request it happened in, so an export and the rows it returned can be
   * tied together later.
   */
  readonly requestId?: string
  /** Identifiers and counts. Never a submission's answers. */
  readonly detail?: Readonly<Record<string, string | number | boolean>>
}

/** What a caller has to supply; the id and the timestamp are minted for it. */
export type AuditDraft = Omit<AuditEntry, 'id' | 'at'>

/**
 * An entry from an actor, with the fields spread the way the record stores
 * them.
 *
 * A helper rather than a convention, because `actorKind` and `actorId` being
 * set together is exactly the sort of thing eleven call sites get wrong once.
 */
export function auditedBy(actor: Actor | undefined, draft: Omit<AuditDraft, 'actorKind' | 'actorId'>): AuditDraft {
  return actor === undefined
    ? draft
    : { ...draft, actorKind: actor.kind, actorId: actor.id }
}
