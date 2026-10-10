import type { FastifyRequest } from 'fastify'
import { auditedBy } from '@formancy/server-core'
import type { Actor, AuditDraft, ServerDeps } from '@formancy/server-core'

/** What a route calls to record something it has done. */
export type Audit = (request: FastifyRequest, draft: AuditDraft) => Promise<void>

/**
 * Append an audit row for something that has already happened.
 *
 * Never throws. An export that succeeded and an audit row that did not is
 * bad; an export that 500s because the audit row failed, after the rows have
 * already been written to the response, is worse and helps nobody. So the
 * failure is written to the log at error level, as `audit.unwritten` with the
 * row's action and the error's kind — never its subject, which for a failed
 * login is the email somebody tried — and the request stands.
 *
 * For a mutation that HAS a transaction, do not use this — pass the entry
 * into that call so the two commit together. `insertSubmission` is currently
 * the only one.
 *
 * Its own module because what happens when a row cannot be written is the log's
 * business (0168), and `app.ts` had no room for it.
 */
export function auditTrail(deps: Pick<ServerDeps, 'storage' | 'newId' | 'nowIso'>): Audit {
  return async (request, draft) => {
    const actor = (request as FastifyRequest & { actor?: Actor }).actor
    try {
      await deps.storage.recordAudit({
        id: deps.newId(),
        at: deps.nowIso(),
        requestId: request.id,
        ...auditedBy(actor, draft),
      })
    } catch (error) {
      request.log.error({ event: 'audit.unwritten', action: draft.action, err: error })
    }
  }
}
