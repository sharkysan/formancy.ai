import { randomUUID } from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { offerUpload, resolveForm, screenUpload } from '@formancy/server-core'
import type { Actor, ServerDeps } from '@formancy/server-core'
import type { FileStore } from '../file-store.js'

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

    // Asked before the bytes are kept, so a file the deployment's scanner refuses is never
    // in its store, not even until the collector runs. The row stays offered: a retry may
    // send the bytes again (0131).
    const screened = await screenUpload(deps.scanner, file, bytes)
    if (!screened.ok) {
      if (screened.reason === 'refused') {
        request.log.warn(
          { file: file.id, finding: screened.finding },
          'upload refused by the scanner',
        )
        return reply.code(422).send({
          error: 'refused_by_scanner',
          message: `This file was refused by the deployment's virus scanner (${screened.finding}).`,
        })
      }
      request.log.error({ file: file.id, cause: screened.cause }, 'the scanner could not be asked')
      return reply.code(503).send({
        error: 'scanner_unavailable',
        message: 'This file could not be scanned just now, so it was not kept. Try again.',
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
