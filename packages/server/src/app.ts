import { randomUUID } from 'node:crypto'
import Fastify from 'fastify'
import type { FastifyInstance, FastifyRequest, preHandlerHookHandler } from 'fastify'
import {
  authenticateApiKey,
  authenticateLocal,
  can,
  createApiKey,
  createLocalUser,
  createSubmission,
  exportCsv,
  listForms,
  listSubmissions,
  listVersions,
  publishForm,
  resolveForm,
  setFormAccess,
  resumeDraft,
  saveDraft,
} from '@formancy/server-core'
import type { Action, Actor, AuthDeps, Role, ServerDeps, Storage } from '@formancy/server-core'
import { createSessionTokens, realRandomToken, realSecretHashing } from './auth-runtime.js'

export const SCHEMA_HASH_HEADER = 'x-formancy-schema-hash'
export const API_KEY_HEADER = 'x-formancy-api-key'

export interface AppOptions {
  /** Signs the short-lived session tokens. At least 32 characters. */
  authSecret: string
  /**
   * Created at startup IF no user exists yet — the docker-compose path to a
   * first login. Ignored once any user exists, so it cannot re-seed an admin
   * into a running installation.
   */
  bootstrapAdmin?: { email: string; password: string }
}

/**
 * The HTTP surface, split into two planes.
 *
 * PUBLIC — what a person filling a form needs: resolve, submit, drafts. These
 * stay unauthenticated by design; anonymous-submission hardening is its own
 * upcoming step and is opt-in per form.
 *
 * MANAGEMENT — everything an operator does: publish, catalog, submissions,
 * export, users, keys. Authenticated via a session token (login) or an API
 * key header, authorized through server-core's one-table can().
 *
 * This file is the composition root, so THIS is where ambient reality enters:
 * randomUUID, the real clock, argon2 and the CSPRNG. Everything below stays
 * injected and replayable.
 */
export async function createApp(storage: Storage, options: AppOptions): Promise<FastifyInstance> {
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

  const authDeps: AuthDeps = {
    storage,
    newId: deps.newId,
    nowIso: deps.nowIso,
    randomToken: realRandomToken,
    ...realSecretHashing(),
  }

  const sessions = createSessionTokens(options.authSecret)

  if (options.bootstrapAdmin !== undefined) {
    const alreadyThere = await storage.getUserByEmail(options.bootstrapAdmin.email)
    if (alreadyThere === undefined) {
      const outcome = await createLocalUser(authDeps, { ...options.bootstrapAdmin, role: 'admin' })
      if (!outcome.ok) throw new Error(`Bootstrap admin rejected: ${outcome.message}`)
    }
  }

  async function actorOf(request: FastifyRequest): Promise<Actor | undefined> {
    const bearer = request.headers.authorization
    if (typeof bearer === 'string' && bearer.startsWith('Bearer ')) {
      return sessions.verify(bearer.slice('Bearer '.length))
    }
    const apiKey = request.headers[API_KEY_HEADER]
    if (typeof apiKey === 'string' && apiKey !== '') {
      const outcome = await authenticateApiKey(authDeps, apiKey)
      return outcome.ok ? outcome.actor : undefined
    }
    return undefined
  }

  /** 401 without an identity, 403 with one that lacks the permission — the
   *  difference tells a client whether to log in or to give up. */
  function requires(action: Action): preHandlerHookHandler {
    return async (request, reply) => {
      const actor = await actorOf(request)
      if (actor === undefined) {
        return reply.code(401).send({ error: 'unauthenticated' })
      }
      if (!can(actor, action)) {
        return reply.code(403).send({ error: 'forbidden', action })
      }
      ;(request as FastifyRequest & { actor: Actor }).actor = actor
    }
  }

  // -------------------------------------------------------------------- auth

  app.post('/auth/login', async (request, reply) => {
    const body = request.body as { email?: unknown; password?: unknown } | null
    if (body === null || typeof body.email !== 'string' || typeof body.password !== 'string') {
      return reply.code(400).send({ error: 'bad_request', message: 'Body needs { email, password }.' })
    }
    const outcome = await authenticateLocal(authDeps, { email: body.email, password: body.password })
    if (!outcome.ok) return reply.code(401).send({ error: 'invalid_credentials' })
    return reply.send({ token: await sessions.issue(outcome.actor), role: outcome.actor.role })
  })

  app.post('/users', { preHandler: requires('user.create') }, async (request, reply) => {
    const body = request.body as { email?: unknown; password?: unknown; role?: unknown } | null
    if (
      body === null ||
      typeof body.email !== 'string' ||
      typeof body.password !== 'string' ||
      (body.role !== 'admin' && body.role !== 'editor' && body.role !== 'viewer')
    ) {
      return reply
        .code(400)
        .send({ error: 'bad_request', message: 'Body needs { email, password, role }.' })
    }
    const outcome = await createLocalUser(authDeps, {
      email: body.email,
      password: body.password,
      role: body.role as Role,
    })
    if (!outcome.ok) return reply.code(422).send({ error: 'rejected', message: outcome.message })
    return reply.code(201).send({ id: outcome.id })
  })

  app.post('/api-keys', { preHandler: requires('apiKey.create') }, async (request, reply) => {
    const body = request.body as { name?: unknown; role?: unknown } | null
    if (
      body === null ||
      typeof body.name !== 'string' ||
      (body.role !== 'admin' && body.role !== 'editor' && body.role !== 'viewer')
    ) {
      return reply.code(400).send({ error: 'bad_request', message: 'Body needs { name, role }.' })
    }
    const outcome = await createApiKey(authDeps, { name: body.name, role: body.role as Role })
    if (!outcome.ok) return reply.code(422).send({ error: 'rejected', message: outcome.message })
    // The one and only time the secret exists in full outside a hash.
    return reply.code(201).send({ id: outcome.id, secret: outcome.secret })
  })

  // -------------------------------------------------------------- management

  app.post('/forms', { preHandler: requires('form.publish') }, async (request, reply) => {
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
    return reply.code(201).send({ version: outcome.version, schemaHash: outcome.schemaHash })
  })

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
    return reply.code(204).send()
  })

  app.get('/forms', { preHandler: requires('form.read') }, async (_request, reply) => {
    return reply.send({ forms: await listForms(deps) })
  })

  app.get('/f/:path/versions', { preHandler: requires('form.read') }, async (request, reply) => {
    const { path } = request.params as { path: string }
    const versions = await listVersions(deps, path)
    if (versions === undefined) return reply.code(404).send({ error: 'unknown_form' })
    return reply.send({ versions })
  })

  app.get(
    '/f/:path/submissions',
    { preHandler: requires('submission.read') },
    async (request, reply) => {
      const { path } = request.params as { path: string }
      const listed = await listSubmissions(deps, path)
      if (listed === undefined) return reply.code(404).send({ error: 'unknown_form' })
      return reply.send({ submissions: listed })
    },
  )

  app.get(
    '/f/:path/submissions/export.csv',
    { preHandler: requires('submission.export') },
    async (request, reply) => {
      const { path } = request.params as { path: string }
      const csv = await exportCsv(deps, path)
      if (csv === undefined) return reply.code(404).send({ error: 'unknown_form' })
      return reply
        .header('content-type', 'text/csv; charset=utf-8')
        .header('content-disposition', `attachment; filename="${path}-submissions.csv"`)
        .send(csv)
    },
  )

  // ------------------------------------------------------------------ public

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

  app.put('/f/:path/drafts/:draftId', async (request, reply) => {
    const { path, draftId } = request.params as { path: string; draftId: string }
    const saved = await saveDraft(deps, { path, draftId, data: request.body ?? {} })
    if (saved === undefined) return reply.code(404).send({ error: 'unknown_form' })
    return reply.send(saved)
  })

  app.get('/f/:path/drafts/:draftId', async (request, reply) => {
    const { path, draftId } = request.params as { path: string; draftId: string }
    const resumed = await resumeDraft(deps, { path, draftId })
    if (resumed === undefined) return reply.code(404).send({ error: 'unknown_draft' })
    return reply.send(resumed)
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

    // The public plane is public, so an identity is optional here — but if one
    // is presented and valid, the access policy does not apply to it. An
    // invalid credential is treated as no credential rather than as an error:
    // this route's job is to accept submissions, not to adjudicate logins.
    const actor = await actorOf(request)
    const origin = request.headers.origin

    const outcome = await createSubmission(deps, {
      path,
      declaredSchemaHash,
      data: request.body ?? {},
      actor: actor === undefined ? 'anonymous' : 'authenticated',
      ...(typeof origin === 'string' ? { origin } : {}),
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
      case 'forbidden':
        // Deliberately says nothing about WHICH rule refused. "Not public" and
        // "not from your origin" are the same answer to someone probing.
        return reply.code(403).send({ error: 'forbidden' })
    }
  })

  return app
}
