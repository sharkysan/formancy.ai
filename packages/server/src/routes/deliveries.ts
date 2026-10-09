import type { FastifyInstance, FastifyRequest, preHandlerHookHandler } from 'fastify'
import { healthOf, replayDelivery } from '@formancy/server-core'
import type { AuditDraft, ServerDeps } from '@formancy/server-core'

/**
 * Webhooks as an operator sees them: their health, the deliveries that died, and
 * sending one of those again.
 *
 * One route family per plugin, the seam `app.ts`'s size budget names. It moved
 * when that file needed room to say which proxy it believes about a client.
 */
export async function deliveryRoutes(
  app: FastifyInstance,
  {
    deps,
    requires,
    audit,
  }: {
    deps: ServerDeps
    requires: (action: 'form.publish') => preHandlerHookHandler
    audit: (request: FastifyRequest, draft: AuditDraft) => Promise<void>
  },
): Promise<void> {
  /**
   * Webhook health, and the deliveries that died.
   *
   * The reason the breaker keeps its counters on the row rather than in the
   * worker's memory. A self-hoster has no operations team watching a
   * dashboard, so a destination refusing deliveries since Tuesday has to be
   * answerable from the product — otherwise it is found when somebody asks
   * why the CRM has no leads this week.
   */
  app.get('/webhooks', { preHandler: requires('form.publish') }, async (_request, reply) => {
    const now = new Date(deps.nowIso())
    const hooks = await deps.storage.listWebhooks()
    return reply.send({ webhooks: hooks.map((hook) => healthOf(hook, now)) })
  })

  app.get('/deliveries/dead', { preHandler: requires('form.publish') }, async (request, reply) => {
    const raw = (request.query as { limit?: unknown } | undefined)?.limit
    const asked = typeof raw === 'string' ? Number.parseInt(raw, 10) : 50
    const limit = Number.isFinite(asked) ? Math.min(Math.max(asked, 1), 200) : 50
    const dead = await deps.storage.deadDeliveries(limit)
    // Not the body. That is the submission's data in another coat, and this
    // endpoint answers "what failed", not "what was in it".
    return reply.send({
      deliveries: dead.map((delivery) => ({
        id: delivery.id,
        webhookId: delivery.webhookId,
        submissionId: delivery.submissionId,
        eventId: delivery.eventId,
        attempt: delivery.attempt,
        lastError: delivery.lastError,
      })),
    })
  })

  app.post(
    '/deliveries/:id/replay',
    { preHandler: requires('form.publish') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const outcome = await replayDelivery(
        { storage: deps.storage, now: () => new Date(deps.nowIso()) },
        id,
      )

      if (!outcome.ok) {
        return outcome.kind === 'unknown'
          ? reply.code(404).send({ error: 'unknown_delivery' })
          : reply.code(409).send({
              error: 'not_dead',
              state: outcome.state,
              message:
                'Only a dead delivery can be replayed. A pending one is already queued, and a delivered one would be sent twice.',
            })
      }

      // Recorded: it sends data to a third party on a person's say-so.
      await audit(request, {
        action: 'delivery.replayed',
        subject: id,
        detail: { webhookId: outcome.delivery.webhookId },
      })
      return reply.code(202).send({ id, state: outcome.delivery.state })
    },
  )
}
