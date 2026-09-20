import { randomUUID } from 'node:crypto'
import Fastify from 'fastify'
import type { FastifyInstance } from 'fastify'
import { createSubmission, exportCsv, listSubmissions, publishForm, resolveForm } from '@formancy/server-core'
import type { ServerDeps, Storage } from '@formancy/server-core'

export const SCHEMA_HASH_HEADER = 'x-formancy-schema-hash'

/**
 * The HTTP surface of the thin slice.
 *
 * This file is the composition root, so THIS is where ambient reality enters:
 * randomUUID for identities and the real clock for capabilities. Everything
 * below it stays injected and replayable.
 */
export function createApp(storage: Storage): FastifyInstance {
  const app = Fastify({ logger: false })

  const deps: ServerDeps = {
    storage,
    newId: () => randomUUID(),
    nowIso: () => new Date().toISOString(),
    capabilities: {
      now: () => Date.now(),
      today: () => new Date().toISOString().slice(0, 10),
      random: () => Math.random(),
    },
  }

  app.post('/forms', async (request, reply) => {
    const body = request.body as { path?: unknown; schema?: unknown } | null
    if (body === null || typeof body.path !== 'string' || body.path === '' || body.schema === undefined) {
      return reply.code(400).send({ error: 'bad_request', message: 'Body needs { path, schema }.' })
    }

    const outcome = await publishForm(deps, { path: body.path, schema: body.schema })
    if (!outcome.ok) {
      return reply.code(422).send({
        error: outcome.kind,
        ...(outcome.kind === 'invalid_schema' ? { errors: outcome.errors } : { message: outcome.message }),
      })
    }
    return reply.code(201).send({
      version: outcome.version,
      schemaHash: outcome.schemaHash,
    })
  })

  app.get('/f/:path', async (request, reply) => {
    const { path } = request.params as { path: string }
    const resolved = await resolveForm(deps, path)
    if (resolved === undefined) return reply.code(404).send({ error: 'unknown_form' })
    return reply.send({
      version: resolved.version,
      schemaHash: resolved.schemaHash,
      schema: resolved.schema,
    })
  })

  // NOTE: listing and export ship unauthenticated in the thin slice, exactly
  // like publish — the auth layer is SP-6 and wraps all management routes at
  // once. Do not deploy this slice anywhere public.
  app.get('/f/:path/submissions', async (request, reply) => {
    const { path } = request.params as { path: string }
    const listed = await listSubmissions(deps, path)
    if (listed === undefined) return reply.code(404).send({ error: 'unknown_form' })
    return reply.send({ submissions: listed })
  })

  app.get('/f/:path/submissions/export.csv', async (request, reply) => {
    const { path } = request.params as { path: string }
    const csv = await exportCsv(deps, path)
    if (csv === undefined) return reply.code(404).send({ error: 'unknown_form' })
    return reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="${path}-submissions.csv"`)
      .send(csv)
  })

  app.post('/f/:path/submissions', async (request, reply) => {
    const { path } = request.params as { path: string }
    const declaredSchemaHash = request.headers[SCHEMA_HASH_HEADER]
    if (typeof declaredSchemaHash !== 'string' || declaredSchemaHash === '') {
      return reply.code(400).send({
        error: 'missing_schema_hash',
        message: `Send the schema hash you rendered in the ${SCHEMA_HASH_HEADER} header.`,
      })
    }

    const outcome = await createSubmission(deps, {
      path,
      declaredSchemaHash,
      data: request.body ?? {},
    })

    if (outcome.ok) return reply.code(201).send({ id: outcome.id, data: outcome.canonicalData })

    switch (outcome.kind) {
      case 'unknown_form':
        return reply.code(404).send({ error: 'unknown_form' })
      case 'version_changed':
        // 409 carries the CURRENT schema so the client can re-render and
        // preserve what it can, instead of guessing why it was refused.
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
      case 'invalid':
        // The identical error shape the client's engine produces, so server
        // errors render through the same code path as local ones.
        return reply.code(422).send({ error: 'invalid', errors: outcome.errors })
    }
  })

  return app
}
