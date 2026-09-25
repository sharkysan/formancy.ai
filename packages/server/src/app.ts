import { randomUUID } from 'node:crypto'
import Fastify from 'fastify'
import type { FileStore } from './file-store.js'
import rateLimit from '@fastify/rate-limit'
import type { FastifyInstance, FastifyRequest, preHandlerHookHandler } from 'fastify'
import {
  auditedBy,
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
  offerUpload,
  publishForm,
  resolveForm,
  resumeDraft,
  saveDraft,
  setFormAccess,
} from '@formancy/server-core'
import type {
  Action,
  Actor,
  AuditDraft,
  AuthDeps,
  Role,
  ServerDeps,
  Storage,
} from '@formancy/server-core'
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
  /**
   * Anonymous submissions allowed per IP per minute. Off in tests by setting
   * it high; a real deployment should leave the default.
   *
   * NOTE: @fastify/rate-limit's default store is in-memory and therefore
   * PER PROCESS. Behind more than one replica this counts a fraction of the
   * traffic and silently permits N times the limit. A multi-replica
   * deployment must supply a shared store.
   */
  submissionRateLimit?: { max: number; timeWindowMs: number }
  /** Login attempts per IP per minute. Defaults to 10. */
  loginRateLimit?: { max: number; timeWindowMs: number }
  /**
   * Largest accepted request body, in bytes. A structural cap BEFORE parsing:
   * the JSON parser should never be handed something enormous in the first
   * place, whatever the schema says afterwards.
   */
  bodyLimitBytes?: number
  /**
   * Where uploaded bytes go. Absent means this deployment accepts no files:
   * a form with a file field still renders and still submits, and the field
   * says plainly that there is nowhere to put one
   * ([0055](../../../docs/decisions/0055-files-are-claimed.md)).
   */
  fileStore?: FileStore
  /**
   * Largest file this deployment will accept, whatever a form says. A form
   * author sets the per-field limit; this is the operator's ceiling over all
   * of them, because the disk is theirs. Defaults to 10 MB.
   */
  maxFileBytes?: number
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
  // 256 kB by default. Large enough for a long form with a repeater, small
  // enough that a request cannot cost meaningful memory before it is rejected.
  const app = Fastify({ logger: false, bodyLimit: options.bodyLimitBytes ?? 256 * 1024 })

  const maxFileBytes = options.maxFileBytes ?? 10 * 1024 * 1024
  const fileStore = options.fileStore

  // Bytes arrive as a body, not as JSON, so the parser is told to hand them
  // over untouched. Registered for every content type because a file is
  // whatever the reader had — the form's `accept` list is what decides
  // whether it is allowed, and that is checked before the upload is offered.
  app.addContentTypeParser('*', { parseAs: 'buffer', bodyLimit: maxFileBytes }, (_request, body, done) => {
    done(null, body)
  })

  const submissionLimit = options.submissionRateLimit ?? { max: 30, timeWindowMs: 60_000 }
  const loginLimit = options.loginRateLimit ?? { max: 10, timeWindowMs: 60_000 }
  await app.register(rateLimit, {
    global: false, // opted into per route: the management plane is authenticated
    max: submissionLimit.max,
    timeWindow: submissionLimit.timeWindowMs,
  })

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

  /**
   * Append an audit row for something that has already happened.
   *
   * Never throws. An export that succeeded and an audit row that did not is
   * bad; an export that 500s because the audit row failed, after the rows have
   * already been written to the response, is worse and helps nobody. So the
   * failure is logged loudly at error level and the request stands.
   *
   * For a mutation that HAS a transaction, do not use this — pass the entry
   * into that call so the two commit together. `insertSubmission` is currently
   * the only one.
   */
  async function audit(request: FastifyRequest, draft: AuditDraft): Promise<void> {
    const actor = (request as FastifyRequest & { actor?: Actor }).actor
    try {
      await deps.storage.recordAudit({
        id: deps.newId(),
        at: deps.nowIso(),
        requestId: request.id,
        ...auditedBy(actor, draft),
      })
    } catch (error) {
      request.log.error({ err: error, action: draft.action }, 'audit row could not be written')
    }
  }

  // -------------------------------------------------------------------- auth

  app.post(
    '/auth/login',
    {
      // Enumeration resistance makes a wrong guess cost a full argon2
      // verification, which is deliberate — but it also means an unlimited
      // login endpoint is an unlimited invitation to spend the server's CPU.
      // Tighter than submission: nobody logs in ten times a minute honestly.
      config: { rateLimit: { max: loginLimit.max, timeWindow: loginLimit.timeWindowMs } },
    },
    async (request, reply) => {
      const body = request.body as { email?: unknown; password?: unknown } | null
      if (body === null || typeof body.email !== 'string' || typeof body.password !== 'string') {
        return reply
          .code(400)
          .send({ error: 'bad_request', message: 'Body needs { email, password }.' })
      }
      const outcome = await authenticateLocal(authDeps, {
        email: body.email,
        password: body.password,
      })
      if (!outcome.ok) {
        // Failures too, and this is the pair that matters: a hundred failures
        // then one success is the shape of an attack, and recording only the
        // success hides it. The email is the subject because that is what was
        // tried — there may be no such user.
        await audit(request, { action: 'auth.login.failed', subject: body.email })
        return reply.code(401).send({ error: 'invalid_credentials' })
      }
      await audit(request, {
        action: 'auth.login',
        subject: body.email,
        actorKind: 'user',
        actorId: outcome.actor.id,
      })
      return reply.send({ token: await sessions.issue(outcome.actor), role: outcome.actor.role })
    },
  )

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

    const outcome = await publishForm(deps, {
      path: body.path,
      schema: body.schema,
      // Passed in so the audit row can be written INSIDE the publish's
      // transaction. Appended here afterwards, it would record a publish that
      // half-applied as having happened.
      actor: (request as FastifyRequest & { actor: Actor }).actor,
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
      }
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
    // A permission change is the event a security review looks for first.
    await audit(request, {
      action: 'form.access.changed',
      subject: path,
      detail: { submit, allowedOrigins: origins === undefined ? 'unchanged' : (origins as string[]).join(' ') },
    })
    return reply.code(204).send()
  })

  /**
   * The log itself.
   *
   * Admin only, and reading it is NOT audited. A log that records its own
   * reads grows without bound from a dashboard that polls it, and the entry
   * would say nothing an access log does not — the events worth recording
   * are the ones that touch somebody else's data.
   */
  app.get('/audit', { preHandler: requires('user.create') }, async (request, reply) => {
    const raw = (request.query as { limit?: unknown } | undefined)?.limit
    const asked = typeof raw === 'string' ? Number.parseInt(raw, 10) : 100
    const limit = Number.isFinite(asked) ? Math.min(Math.max(asked, 1), 500) : 100
    return reply.send({ entries: await deps.storage.listAudit(limit) })
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
      // The event a data protection officer asks about, and the one an audit
      // log that covers only mutations cannot answer: who read other people's
      // answers. The count, never the answers.
      await audit(request, {
        action: 'submission.read',
        subject: path,
        detail: { count: listed.length },
      })
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
      // An export leaves the building. Bytes rather than rows, because that is
      // what was actually handed over.
      await audit(request, {
        action: 'submission.exported',
        subject: path,
        detail: { bytes: Buffer.byteLength(csv, 'utf8') },
      })
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

  /**
   * Ask where to put a file.
   *
   * Refusing here, before a byte is sent, is the difference between rejecting
   * a 2 GB upload and receiving one first. The reply carries the id the
   * submission will reference and the URL to PUT the bytes to.
   */
  app.post('/f/:path/files', {
    config: { rateLimit: { max: submissionLimit.max, timeWindowMs: submissionLimit.timeWindowMs } },
  }, async (request, reply) => {
    if (fileStore === undefined) {
      return reply.code(501).send({
        error: 'uploads_unavailable',
        message: 'This deployment has no file store configured, so it cannot accept uploads.',
      })
    }

    const { path } = request.params as { path: string }
    const resolved = await resolveForm(deps, path)
    if (resolved === undefined) return reply.code(404).send({ error: 'unknown_form' })

    const form = await storage.getFormByPath(path)
    if (form === undefined) return reply.code(404).send({ error: 'unknown_form' })

    const actor = await actorOf(request)
    const origin = request.headers.origin

    const body = (request.body ?? {}) as {
      field?: unknown
      name?: unknown
      size?: unknown
      contentType?: unknown
    }
    const field = typeof body.field === 'string' ? body.field : undefined
    const name = typeof body.name === 'string' ? body.name : undefined
    const size = typeof body.size === 'number' ? body.size : undefined
    const contentType = typeof body.contentType === 'string' ? body.contentType : 'application/octet-stream'

    if (field === undefined || name === undefined || size === undefined) {
      return reply.code(400).send({
        error: 'invalid_request',
        message: 'Send the field, the name and the size of the file you want to upload.',
      })
    }

    if (size > maxFileBytes) {
      return reply.code(413).send({
        error: 'too_large',
        message: `This deployment accepts files up to ${String(maxFileBytes)} bytes.`,
      })
    }

    const outcome = await offerUpload(
      { storage, now: () => new Date(), newId: () => randomUUID() },
      {
        schema: resolved.schema,
        form,
        actor: actor === undefined ? 'anonymous' : 'authenticated',
        origin: typeof origin === 'string' ? origin : undefined,
        field,
        name,
        size,
        contentType,
      },
    )

    if (!outcome.ok) {
      const status =
        outcome.reason === 'not_allowed' ? 403 : outcome.reason === 'too_large' ? 413 : 400
      return reply.code(status).send({ error: outcome.reason })
    }

    return reply.code(201).send({
      id: outcome.file.id,
      name: outcome.file.name,
      size: outcome.file.size,
      contentType: outcome.file.contentType,
      storageKey: outcome.file.storageKey,
      // Where to PUT the bytes. A URL rather than a key so an S3 store can
      // hand back a presigned one here and the client never learns the
      // difference.
      uploadUrl: `/f/${encodeURIComponent(path)}/files/${outcome.file.id}`,
    })
  })

  /** Receive the bytes for a file that was offered. */
  app.put('/f/:path/files/:id', async (request, reply) => {
    if (fileStore === undefined) return reply.code(501).send({ error: 'uploads_unavailable' })

    const { path, id } = request.params as { path: string; id: string }
    const form = await storage.getFormByPath(path)
    if (form === undefined) return reply.code(404).send({ error: 'unknown_form' })

    const file = await storage.getFile(id)
    // Checked against the form in the URL: an id alone must not be enough to
    // write bytes into a form somebody cannot submit to.
    if (file === undefined || file.formId !== form.id) {
      return reply.code(404).send({ error: 'unknown_file' })
    }
    if (file.state !== 'offered') {
      // An upload is once. Re-writing a claimed file would change what a
      // stored submission says was attached to it.
      return reply.code(409).send({ error: 'already_uploaded' })
    }

    const bytes = request.body
    if (!Buffer.isBuffer(bytes)) return reply.code(400).send({ error: 'no_body' })
    if (bytes.byteLength > maxFileBytes) return reply.code(413).send({ error: 'too_large' })
    if (bytes.byteLength !== file.size) {
      // The offer named a size and the offer is what was checked against the
      // field's limit. Accepting a different number of bytes would make that
      // check a suggestion.
      return reply.code(400).send({
        error: 'size_mismatch',
        message: `This upload was offered as ${String(file.size)} bytes and ${String(bytes.byteLength)} arrived.`,
      })
    }

    await fileStore.put(file.storageKey, bytes)
    await storage.updateFile({ ...file, state: 'stored' })

    return reply.code(204).send()
  })

  /**
   * Serve a file back.
   *
   * Always as an attachment, never inline, and `nosniff` alongside it. Stored
   * cross-site scripting through an uploaded HTML or SVG file is the most
   * commonly exploited vulnerability in this product category, and the real
   * answer is a separate hostname — which a single-container deployment does
   * not have. Forcing a download is the accommodation, and it is the one place
   * this deployment model genuinely costs something.
   */
  app.get('/f/:path/files/:id', async (request, reply) => {
    if (fileStore === undefined) return reply.code(501).send({ error: 'uploads_unavailable' })

    const { path, id } = request.params as { path: string; id: string }
    const actor = await actorOf(request)
    if (actor === undefined) return reply.code(401).send({ error: 'unauthenticated' })

    const form = await storage.getFormByPath(path)
    const file = await storage.getFile(id)
    if (form === undefined || file === undefined || file.formId !== form.id) {
      return reply.code(404).send({ error: 'unknown_file' })
    }

    const stream = await fileStore.open(file.storageKey)
    if (stream === undefined) return reply.code(404).send({ error: 'unknown_file' })

    return reply
      .header('content-type', 'application/octet-stream')
      .header('x-content-type-options', 'nosniff')
      .header('content-security-policy', "default-src 'none'; sandbox")
      // The reader's own name for it, quoted and stripped of anything that
      // could end the header early.
      .header('content-disposition', `attachment; filename="${file.name.replace(/["\r\n]/g, '')}"`)
      .send(stream)
  })

  app.post(
    '/f/:path/submissions',
    {
      // The one unauthenticated write in the product, so the one that needs
      // this most. Keyed by IP, which is the only identity an anonymous
      // submitter has.
      config: { rateLimit: { max: submissionLimit.max, timeWindow: submissionLimit.timeWindowMs } },
    },
    async (request, reply) => {
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
    },
  )

  return app
}
