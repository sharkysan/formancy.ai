import type { FastifyInstance, FastifyRequest, preHandlerHookHandler } from 'fastify'
import { publishForm } from '@formancy/server-core'
import type { Actor, ServerDeps } from '@formancy/server-core'
import { SCHEMA_HASH_HEADER } from '../headers.js'

/**
 * Publishing a form, as a plugin of its own.
 *
 * One route family per plugin, which is Fastify's own unit and what `app.ts`'s
 * size budget named as the seam. It moved when the budget refused the next thing
 * added to it rather than letting the number drift.
 */
export async function publishRoutes(
  app: FastifyInstance,
  { deps, requires }: { deps: ServerDeps; requires: (action: 'form.publish') => preHandlerHookHandler },
): Promise<void> {
app.post('/forms', { preHandler: requires('form.publish') }, async (request, reply) => {
  const body = request.body as { path?: unknown; schema?: unknown } | null
  if (body === null || typeof body.path !== 'string' || body.path === '' || body.schema === undefined) {
    return reply.code(400).send({ error: 'bad_request', message: 'Body needs { path, schema }.' })
  }

  // The same header the submission route reads, and for the same reason: the
  // client declares what it was looking at. Absent is a real answer — a script
  // or an agent composes a document rather than opening one — so this is not
  // required the way it is on a submission.
  const basedOn = request.headers[SCHEMA_HASH_HEADER]

  const outcome = await publishForm(deps, {
    path: body.path,
    schema: body.schema,
    // Passed in so the audit row can be written INSIDE the publish's
    // transaction. Appended here afterwards, it would record a publish that
    // half-applied as having happened.
    actor: (request as FastifyRequest & { actor: Actor }).actor,
    ...(typeof basedOn === 'string' && basedOn !== '' ? { basedOnSchemaHash: basedOn } : {}),
  })
  if (!outcome.ok) {
    // A switch rather than a ternary chain, so adding a refusal kind to
    // PublishOutcome fails to compile here until it is given a shape.
    switch (outcome.kind) {
      case 'invalid_schema':
        return reply.code(422).send({ error: outcome.kind, errors: outcome.errors })
      case 'unsafe_pattern':
        // The pattern and its complexity, so the author can see which field
        // and why rather than being told no.
        return reply.code(422).send({ error: outcome.kind, patterns: outcome.patterns })
      case 'invalid_logic':
        return reply.code(422).send({ error: outcome.kind, message: outcome.message })
      case 'unknown_options_source':
        // The names, so an author can see which list this deployment has never
        // heard of rather than being told no. A published version is frozen
        // forever, so a form naming an unresolvable list would render a message
        // instead of a chooser with nothing ever having said so.
        return reply.code(422).send({ error: outcome.kind, sources: outcome.sources })
      case 'already_published':
        // 409 as well, because it is the same kind of answer: the state on the
        // server is not what this request assumed. Named differently, and
        // carrying the version, because the fix is different — there is
        // nothing to merge, the document is already there.
        return reply.code(409).send({ error: outcome.kind, version: outcome.version })
      case 'version_changed':
        // The same status, the same error name and the same body the
        // submission route sends, so a client that already handles one stale
        // version handles both — and an editor can show what changed rather
        // than fetching and diffing to find out why it was refused.
        return reply.code(409).send({
          error: 'FORM_VERSION_CHANGED',
          current:
            outcome.current === undefined
              ? undefined
              : {
                  version: outcome.current.version,
                  schemaHash: outcome.current.schemaHash,
                  schema: outcome.current.schema,
                },
        })
    }
  }
  // Warnings ride on the 201 rather than changing the status, because the
  // publish succeeded and a 2xx that means "partly" is a status nobody can
  // handle. Omitted when there are none, so a client that has never heard of
  // them sees the body it always saw.
  return reply.code(201).send({
    version: outcome.version,
    schemaHash: outcome.schemaHash,
    ...(outcome.warnings.length > 0 ? { warnings: outcome.warnings } : {}),
  })
})
}
