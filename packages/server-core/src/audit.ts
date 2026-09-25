import type { Actor } from './auth.js'

/**
 * Who did what, to which thing, and when.
 *
 * ── WHAT IS RECORDED, AND THE ONE EVERYBODY FORGETS ─────────────────────────
 *
 * Logins, form publishes, permission changes, submission writes — and
 * **submission reads and exports**. That last pair is the point. An audit log
 * that covers mutations tells you who changed the form; it does not tell you
 * who read four thousand people's answers and downloaded them, which is the
 * question a data protection officer actually asks and the one a self-hoster
 * has no other way to answer.
 *
 * ── WHERE THE ROW IS WRITTEN ────────────────────────────────────────────────
 *
 * Wherever the mutation has a transaction, the row joins it. That is currently
 * exactly one place and it is the important one: `insertSubmission` already
 * commits the submission, its webhook deliveries and its file claims together,
 * and the audit row now commits with them. A submission that rolled back
 * leaves no trace saying it happened.
 *
 * Everywhere else there is no transaction to join, and two different reasons
 * for it:
 *
 * - A **read** is not a mutation. `submission.read` and `submission.export`
 *   are appended after the rows are handed over, because there is nothing to
 *   be atomic with. The risk is an export that succeeds and an audit row that
 *   does not, which is why the failure is logged loudly rather than swallowed.
 * A **publish** used to be here too, as three storage calls that were not one
 * transaction. It is now `publishVersion`: the form when it is new, the
 * version, the pointer that makes it current and the audit row, in one commit.
 * The gap this comment used to describe is closed.
 *
 * ── WHAT IS NOT IN IT ───────────────────────────────────────────────────────
 *
 * The submission's answers. An audit log is read by more people, kept longer
 * and exported more freely than the data it describes, so putting the data
 * inside it makes every one of those a second copy of the thing being
 * protected. `detail` carries identifiers and counts, never content.
 */

/**
 * Every auditable action, as a closed list.
 *
 * Closed on purpose: a `string` here would let a new route invent its own
 * spelling, and an audit log where the same event is called two things is one
 * nobody can query.
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
