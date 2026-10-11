import { STATUS_CODES } from 'node:http'
import type { FastifyInstance, FastifyReply } from 'fastify'
import { isCode } from './server-log.js'

/**
 * What an error answers its client with
 * ([0172](../../../docs/decisions/0172-a-5xx-says-nothing-of-what-was-thrown.md)).
 *
 * Fastify answers an error with `{ statusCode, code, error, message }`, the message being the
 * error's own. For a 4xx that is a sentence written for the client — the body did not parse, the
 * file is too large — and it stays. For a 5xx it is whatever was thrown: a database error's
 * message is the failing query and its parameters, a disk's names the path it could not write.
 * So a 5xx keeps the shape and says only its status: the status's own name as `error` and as
 * `message`, and a `code` only when the error named its own status — made to be answered, as
 * `RATE_LIMIT_UNAVAILABLE` is (0170) — and only in the shape the log keeps a code in. A fault's
 * code, `ENOSPC` or an SQLSTATE, is the operator's, in the log.
 *
 * **Two hooks rather than an error handler**, because Fastify writes its line about an error —
 * `request.failed` and `request.refused`, with the error's kind and code (`server-log.ts`) —
 * only from its own default handler. One set with `setErrorHandler` replaces it, and the line
 * would go with it. So the default handler still sets the status and writes the line, and the
 * body is replaced on its way out, in `onSend`, where the status is final. `onError` is how
 * `onSend` knows the body is an error's: a route that answers a 5xx itself — no file store, a
 * scanner that could not be asked — chose its words for the person reading them.
 *
 * On the root instance, before any route is registered, so every route and every plugin's
 * context has both. Not tied to the log: an app given none withholds the same words.
 */
export function withholdServerErrors(app: FastifyInstance): void {
  const thrown = new WeakMap<FastifyReply, unknown>()

  app.addHook('onError', async (_request, reply, error) => {
    thrown.set(reply, error)
  })

  app.addHook('onSend', async (_request, reply, payload) => {
    if (reply.statusCode < 500 || !thrown.has(reply)) return payload
    return JSON.stringify(serverError(reply.statusCode, thrown.get(reply)))
  })
}

/** Fastify's shape for an error's reply, with nothing in it the thrown error said. */
function serverError(status: number, error: unknown): { statusCode: number; code?: string; error: string; message: string } {
  const name = STATUS_CODES[status] ?? 'Server Error'
  const own = isRecord(error) ? error : {}
  // An error that names its status was made to be answered — by this server or by Fastify —
  // and its code is part of the answer; one that names none is a fault from below.
  const answerable = typeof own['statusCode'] === 'number' || typeof own['status'] === 'number'
  const code = answerable && isCode(own['code']) ? own['code'] : undefined
  return { statusCode: status, ...(code === undefined ? {} : { code }), error: name, message: name }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
