import { randomUUID } from 'node:crypto'
import type { FastifyBaseLogger, FastifyInstance, FastifyRequest } from 'fastify'
import { offerUpload, resolveForm, screenUpload } from '@formancy/server-core'
import type { Actor, FileRecord, ServerDeps } from '@formancy/server-core'
import type { FileStore } from '../file-store.js'

/**
 * How long one request holds a file while its bytes are scanned and written (0153).
 *
 * A judgement, not a bound the adapters guarantee. The object store this package supplies
 * abandons a PUT after 30 seconds, as a whole; its clamd adapter's 30 seconds are of silence
 * — any traffic on the connection restarts them — so nothing here limits how long a scan
 * takes. Longer makes an overrun rarer, and keeps a PUT of the same file busy for longer
 * after a request that died holding it. A request that does overrun it can still replace a
 * claimed file's bytes, and `docs/architecture/11-risks-and-debt.md` says what that costs.
 */
const RECEIVE_LEASE_MS = 2 * 60_000

/** What a receiving request answers, decided before it is sent. */
interface Answer {
  status: 204 | 409 | 422 | 503
  body?: { error: string; message: string }
}

/** A request whose lease ran out is not accepted, whichever check found it. */
const OUTLASTED: Answer = {
  status: 409,
  body: {
    error: 'busy',
    message:
      'This upload took longer than the server holds a file for one request, so it was not accepted. Try again.',
  },
}

/**
 * A form's files: offering one, receiving its bytes, and serving it back.
 *
 * One route family per plugin, the seam `app.ts`'s size budget names. It moved when
 * scanning an upload's bytes needed lines that file had no room for.
 */
export async function fileRoutes(
  app: FastifyInstance,
  {
    deps,
    fileStore,
    maxFileBytes,
    limit,
    actorOf,
  }: {
    deps: ServerDeps
    fileStore: FileStore | undefined
    maxFileBytes: number
    limit: { max: number; timeWindowMs: number }
    actorOf: (request: FastifyRequest) => Promise<Actor | undefined>
  },
): Promise<void> {
  const { storage } = deps
  const submissionLimit = limit

  /**
   * Ask where to put a file.
   *
   * Refusing here, before a byte is sent, is the difference between rejecting
   * a 2 GB upload and receiving one first. The reply carries the id the
   * submission will reference and the URL to PUT the bytes to.
   */
  app.post(
    '/f/:path/files',
    {
      config: { rateLimit: { max: submissionLimit.max, timeWindow: submissionLimit.timeWindowMs } },
    },
    async (request, reply) => {
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
      const contentType =
        typeof body.contentType === 'string' ? body.contentType : 'application/octet-stream'

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
    },
  )

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

    // One request receives a file's bytes at a time (0153). Taken after the checks above,
    // so a request that was never going to be kept does not hold the file against one that
    // is.
    const now = deps.nowIso()
    const lease = new Date(Date.parse(now) + RECEIVE_LEASE_MS).toISOString()
    if (!(await storage.leaseFile(file.id, now, lease))) {
      return reply.code(409).send({
        error: 'busy',
        message: "Another request is sending this file's bytes, so these were not kept. Try again in a moment.",
      })
    }

    // Every way out that does not keep the bytes gives the file back, and before the reply:
    // a client that sends this file again, as it is told to, must not find it still held.
    const answer = await receive(fileStore, file, bytes, lease, request.log).catch(
      async (error: unknown) => {
        await giveBack(file.id, lease, request.log)
        throw error
      },
    )
    if (answer.status !== 204) await giveBack(file.id, lease, request.log)
    return reply.code(answer.status).send(answer.body)
  })

  /**
   * Give a file back after a request that kept nothing, without letting the release decide
   * the reply.
   *
   * A release that fails is most likely the database the request has already failed on, and
   * its error would stand in for the one that says why the bytes were not kept — or turn a
   * scanner's refusal into a 500. The lease runs out on its own, so all a failed release
   * costs is a `PUT` of this same file being busy until it does.
   */
  async function giveBack(id: string, lease: string, log: FastifyBaseLogger): Promise<void> {
    await storage.releaseFile(id, lease).catch((cause: unknown) => {
      log.error({ file: id, cause }, 'the file could not be given back; its lease will run out')
    })
  }

  /**
   * Scan a file's bytes, write them and settle its row, for a request holding its lease.
   *
   * Returns the answer rather than sending it, so the route can give the lease back first.
   */
  async function receive(
    store: FileStore,
    file: FileRecord,
    bytes: Buffer,
    lease: string,
    log: FastifyBaseLogger,
  ): Promise<Answer> {
    // Asked before the bytes are kept, so a file the deployment's scanner refuses is never
    // in its store, not even until the collector runs. The row stays offered: a retry may
    // send the bytes again (0131).
    const screened = await screenUpload(deps.scanner, file, bytes)
    if (!screened.ok) {
      if (screened.reason === 'refused') {
        log.warn({ file: file.id, finding: screened.finding }, 'upload refused by the scanner')
        return {
          status: 422,
          body: {
            error: 'refused_by_scanner',
            message: `This file was refused by the deployment's virus scanner (${screened.finding}).`,
          },
        }
      }
      log.error({ file: file.id, cause: screened.cause }, 'the scanner could not be asked')
      return {
        status: 503,
        body: {
          error: 'scanner_unavailable',
          message: 'This file could not be scanned just now, so it was not kept. Try again.',
        },
      }
    }

    // Asked again before the write, because the scan is where the time goes: a lease that
    // ran out meanwhile may be another request's now, whose bytes may already be kept and
    // claimed by a submission.
    const held = await storage.getFile(file.id)
    if (held?.receivingUntil !== lease || Date.parse(deps.nowIso()) >= Date.parse(lease)) {
      return OUTLASTED
    }

    await store.put(file.storageKey, bytes)
    if (await storage.settleFile(file.id, lease)) return { status: 204 }

    // The write itself outlasted the lease. The row is untouched, but these bytes are under a
    // key another request may also have written — the residual 0153 accepts. Nothing but this
    // answer records it: the server has no request log (C3).
    return OUTLASTED
  }

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

    return (
      reply
        .header('content-type', 'application/octet-stream')
        .header('x-content-type-options', 'nosniff')
        .header('content-security-policy', "default-src 'none'; sandbox")
        // The reader's own name for it, quoted and stripped of anything that
        // could end the header early.
        .header(
          'content-disposition',
          `attachment; filename="${file.name.replace(/["\r\n]/g, '')}"`,
        )
        .send(stream)
    )
  })
}
