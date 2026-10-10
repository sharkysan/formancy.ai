import type { FastifyInstance, FastifyRequest, preHandlerHookHandler } from 'fastify'
import { setFormAccess } from '@formancy/server-core'
import type { AuditDraft, ServerDeps } from '@formancy/server-core'

/**
 * Who may submit a form, and from where: a property of the deployment, not of the document,
 * so changing it mints no version and leaves every client's schema hash standing
 * ([0044](../../../../docs/decisions/0044-access-outside-the-document.md)).
 *
 * One route family per plugin, the seam `app.ts`'s size budget names. It left `app.ts` when
 * the examples kept beside a form needed a plugin registered there (0166).
 */
export async function accessRoutes(
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
  app.put('/f/:path/access', { preHandler: requires('form.publish') }, async (request, reply) => {
    const { path } = request.params as { path: string }
    const body = request.body as { submit?: unknown; allowedOrigins?: unknown } | null

    const submit = body?.submit
    if (submit !== 'authenticated' && submit !== 'public') {
      return reply.code(400).send({
        error: 'invalid_access',
        message: 'submit must be "authenticated" or "public".',
      })
    }

    const origins = body?.allowedOrigins
    if (origins !== undefined && !(Array.isArray(origins) && origins.every((o) => typeof o === 'string'))) {
      return reply.code(400).send({
        error: 'invalid_access',
        message: 'allowedOrigins must be an array of strings, or absent for no allowlist.',
      })
    }

    const outcome = await setFormAccess(deps, {
      path,
      submit,
      ...(origins === undefined ? {} : { allowedOrigins: origins as string[] }),
    })
    if (!outcome.ok) return reply.code(404).send({ error: 'unknown_form' })
    // A permission change is the event a security review looks for first.
    await audit(request, {
      action: 'form.access.changed',
      subject: path,
      detail: { submit, allowedOrigins: origins === undefined ? 'unchanged' : (origins as string[]).join(' ') },
    })
    return reply.code(204).send()
  })
}
