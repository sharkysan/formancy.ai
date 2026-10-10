import { randomUUID } from 'node:crypto'
import { fileRoutes } from './routes/files.js'
import { publishRoutes } from './routes/publish.js'
import { accessRoutes } from './routes/access.js'
import { exampleRoutes } from './routes/examples.js'
import { deliveryRoutes } from './routes/deliveries.js'
import { draftRoutes } from './routes/drafts.js'
import { modelRoutes } from './routes/model.js'
import type { DeploymentModel } from './routes/model.js'
import { submissionRoutes } from './routes/submissions.js'
import Fastify from 'fastify'
import type { FileStore } from './file-store.js'
import rateLimit, { type FastifyRateLimitStoreCtor } from '@fastify/rate-limit'
import { limited } from './rate-limits.js'
import type { FastifyInstance, FastifyRequest, preHandlerHookHandler } from 'fastify'
import {
  authenticateApiKey,
  authenticateLocal,
  can,
  createApiKey,
  createLocalUser,
  exportCsv,
  listForms,
  listSubmissions,
  listVersions,
} from '@formancy/server-core'
import type {
  Action,
  Actor,
  AuthDeps,
  Role,
  Scanner,
  ServerDeps,
  ServerOptionsSources,
  Storage,
} from '@formancy/server-core'
import { createSessionTokens, realRandomToken, realSecretHashing } from './auth-runtime.js'
import { checkedMaxFileBytes, DEFAULT_MAX_FILE_BYTES } from './upload-settings.js'
import { serverLogOptions } from './server-log.js'
import type { ServerLogSettings } from './server-log.js'
import { auditTrail } from './audit-trail.js'

export { CHALLENGE_HEADER, SCHEMA_HASH_HEADER, SUBMISSION_TOKEN_HEADER } from './headers.js'

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
   * Turns the proof-of-work challenge on, and signs the challenges it mints.
   *
   * Absent means anonymous submissions are defended by the rate limits, the
   * origin allowlist and the body cap alone. That is a supported state rather
   * than a broken one — a deployment whose forms all require a session has
   * no anonymous surface to protect — and the challenge route says so with a
   * 404 rather than failing.
   */
  challengeSecret?: string
  /**
   * The lists a form document may name with `optionsSource`, and how to check a value
   * against one.
   *
   * Without this the membership check in `server-core` is unreachable, which is how it
   * shipped: the port existed, the use-case called it, and the HTTP server never passed
   * anything — so `SAFETY-ANALYSIS.md`'s A7 stated a constraint that could not run.
   * Found by review before the beta.
   *
   * Absent is still a supported state, and it means what A7 says it means: the server
   * has no vocabulary, so it cannot refuse a publish for naming an unknown list and
   * cannot check a submitted value. A deployment with no sourced field never needs one.
   */
  optionsSources?: ServerOptionsSources
  /**
   * Anonymous submissions allowed per IP per minute. Off in tests by setting
   * it high; a real deployment should leave the default.
   */
  submissionRateLimit?: { max: number; timeWindowMs: number }
  /** Where every limit counts; absent, each process counts its own. `main.ts` passes the
   *  database every replica shares, through `createPostgresRateLimitStore` (0170). */
  rateLimitStore?: FastifyRateLimitStoreCtor
  /** Login attempts per IP per minute. Defaults to 10. */
  loginRateLimit?: { max: number; timeWindowMs: number }
  /**
   * The reverse proxies, as addresses and CIDR ranges, whose X-Forwarded-For
   * names the client every limit above counts. Absent trusts none, so behind a
   * proxy all respondents share its one budget; `trust-proxy.ts` says why there
   * is no hop count and no `true`.
   */
  trustProxy?: string[]
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
   * of them, because the disk is theirs. Defaults to 10 MB; a whole number no
   * larger than `files.size` holds, or `createApp` throws (`upload-settings.ts`).
   */
  maxFileBytes?: number
  /** Asked about every upload's bytes before they are kept; absent, none is asked (0131). */
  scanner?: Scanner
  /**
   * The deployment's model, which the builders ask through `/model/complete` under the
   * briefing this server writes. Absent, there is none: `/model` answers 404 and the admin
   * draws no prompt pane (0165).
   */
  model?: DeploymentModel
  /** Model requests per session per minute. Defaults to 10: a run of three turns, three times. */
  modelRateLimit?: { max: number; timeWindowMs: number }
  /**
   * Where the server's log goes and from which level: a line per request and per error, each
   * built from a list of fields (`server-log.ts`, 0168). Absent, there is none — `main.ts`
   * passes one unless `FORMANCY_LOG_LEVEL` is `off`; a host embedding the app chooses (0115).
   */
  log?: ServerLogSettings
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
  const app = Fastify({
    ...serverLogOptions(options.log),
    // 256 kB by default. Large enough for a long form with a repeater, small
    // enough that a request cannot cost meaningful memory before it is rejected.
    bodyLimit: options.bodyLimitBytes ?? 256 * 1024,
    // Which hop's word request.ip takes, and so whose budget a rate limit spends.
    trustProxy: options.trustProxy ?? false,
  })

  const maxFileBytes = checkedMaxFileBytes(options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES, 'maxFileBytes')
  const fileStore = options.fileStore

  const submissionLimit = options.submissionRateLimit ?? { max: 30, timeWindowMs: 60_000 }
  const loginLimit = options.loginRateLimit ?? { max: 10, timeWindowMs: 60_000 }
  const challengeSecret = options.challengeSecret
  await app.register(rateLimit, {
    global: false, // opted into per route: the management plane is authenticated
    max: submissionLimit.max,
    timeWindow: submissionLimit.timeWindowMs,
    ...(options.rateLimitStore === undefined ? {} : { store: options.rateLimitStore }),
  })

  const deps: ServerDeps = {
    storage,
    newId: () => randomUUID(),
    nowIso: () => new Date().toISOString(),
    // The host's own signing key. A draft token is a server-signed bearer
    // token, which is what that key is already for, and a separate optional
    // secret would mean drafts are unprotected whenever nobody set one.
    draftSecret: options.authSecret,
    ...(options.optionsSources === undefined ? {} : { optionsSources: options.optionsSources }),
    ...(options.scanner === undefined ? {} : { scanner: options.scanner }),
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

  // Never throws: a row that cannot be written is said in the log, and the request stands.
  const audit = auditTrail(deps)

  // -------------------------------------------------------------------- auth

  app.post(
    '/auth/login',
    {
      // Enumeration resistance makes a wrong guess cost a full argon2 verification, which is
      // deliberate — but it also means an unlimited login endpoint is an unlimited invitation
      // to spend the server's CPU. Tighter than submission: nobody logs in ten times a minute
      // honestly. Refused when it cannot be counted, since guessing is what it is for (0170).
      config: { rateLimit: limited(loginLimit, 'refuse') },
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

  // Publishing is its own plugin: one route family per plugin, which is
  // Fastify's own unit and what this file's size budget named as the seam.
  await app.register(publishRoutes, { deps, requires })

  // Who may submit a form, and what it is checked against: kept beside it rather than in
  // a version, each a route family of its own (0044, 0166).
  await app.register(accessRoutes, { deps, requires, audit })
  await app.register(exampleRoutes, { deps, actorOf })

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

  // Webhook health, dead deliveries and replay: a route family of their own.
  await app.register(deliveryRoutes, { deps, requires, audit })

  // The deployment's model, asked on a builder's behalf with the key kept here.
  const modelLimit = options.modelRateLimit ?? { max: 10, timeWindowMs: 60_000 }
  await app.register(modelRoutes, { model: options.model, requires, audit, limit: modelLimit })

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

  // Reading a form, its challenge and submitting it: what a respondent's browser does.
  await app.register(submissionRoutes, { deps, challengeSecret, limit: submissionLimit, actorOf })

  // A respondent's drafts, each behind the key only its starter holds: a family of their own.
  await app.register(draftRoutes, { deps, limit: submissionLimit })

  // Offering a file, receiving its bytes and serving it back: a route family of
  // their own, which is the seam this file's size budget names.
  await app.register(fileRoutes, { deps, fileStore, maxFileBytes, limit: submissionLimit, actorOf })

  return app
}
