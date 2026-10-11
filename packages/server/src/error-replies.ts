import { STATUS_CODES, validateHeaderName, validateHeaderValue } from 'node:http'
import type { FastifyInstance, FastifyReply } from 'fastify'
import { isCode } from './server-log.js'

/**
 * What an error answers its client with
 * ([0172](../../../docs/decisions/0172-a-5xx-says-nothing-of-what-was-thrown.md)).
 *
 * Fastify answers an error with `{ statusCode, code, error, message }`, the message being the
 * error's own. For an error that names its own 4xx that is a sentence written for the client —
 * the body did not parse, the file is too large — and it stays. For a 5xx it is whatever was
 * thrown: a database error's message is the failing query and its parameters, a disk's names
 * the path it could not write. So a 5xx keeps the shape and says only its status: the status's
 * own name as `error` and as `message`, and a `code` only when the error named its own status —
 * made to be answered, as `RATE_LIMIT_UNAVAILABLE` is (0170) — and only in the shape the log
 * keeps a code in. A fault's code, `ENOSPC` or an SQLSTATE, is the operator's, in the log. And a
 * fault answered under a 4xx — Fastify keeps a status of 400 or more that the reply already had
 * — says only that status too (0175): its words were no more written for the client there.
 *
 * **Two hooks rather than an error handler**, because Fastify writes its line about an error —
 * `request.failed` and `request.refused`, with the error's kind and code (`server-log.ts`) —
 * only from its own default handler. One set with `setErrorHandler` replaces it, and the line
 * would go with it. So the default handler still sets the status and writes the line, and the
 * body is replaced on its way out, in `onSend`, where the status is final. `onError` is how
 * `onSend` knows the body is an error's: a route that answers a 5xx itself — no file store, a
 * scanner that could not be asked — chose its words for the person reading them.
 *
 * **An error's reply is written without a header Node cannot write**
 * ([0175](../../../docs/decisions/0175-a-name-goes-into-a-header-encoded.md)). Node checks a
 * header's value when the reply is written, after the route has answered, and throws. Fastify
 * answers that error with the headers the reply already had, so its own reply failed the same
 * way, and Fastify's last resort — which runs no hook — wrote it with Node's code and sentence,
 * under whatever status the reply had. Dropping the header here is what lets this reply be the
 * one that goes out, because no `onSend` hook runs after this one but Fastify's own on a `HEAD`
 * route, which sets only a length — `error-replies.test.ts` puts such a header on a request to
 * every route and reads each answer. A route's own value is built so it cannot be refused
 * (`header-values.ts`); this is for the one that was not.
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
    if (!thrown.has(reply)) return payload
    dropUnwritable(reply)
    const error = thrown.get(reply)
    if (reply.statusCode < 500 && answerable(error)) return payload
    return JSON.stringify(withheld(reply.statusCode, error))
  })
}

/** Remove every header Node would refuse to write, by its own checks rather than a copy of them. */
function dropUnwritable(reply: FastifyReply): void {
  for (const [name, value] of Object.entries(reply.getHeaders())) {
    if (!writable(name, value)) reply.removeHeader(name)
  }
}

/**
 * A header as Node writes it: a number as its digits, and a list one value at a time. Fastify
 * keeps no header without a value — `reply.header` defaults one to `''` — though `getHeaders`
 * is typed as if it might.
 */
function writable(name: string, value: string | number | readonly string[] | undefined): boolean {
  try {
    validateHeaderName(name)
    for (const each of [value ?? []].flat()) validateHeaderValue(name, String(each))
    return true
  } catch {
    return false
  }
}

/**
 * Whether an error names its own status: made to be answered, by this server or by Fastify, so
 * its code is part of the answer and, below 500, its sentence too. One that names none is a
 * fault from below, whatever status the reply already had when it was thrown.
 */
function answerable(error: unknown): boolean {
  return isRecord(error) && (typeof error['statusCode'] === 'number' || typeof error['status'] === 'number')
}

/** Fastify's shape for an error's reply, with nothing in it the thrown error said. */
function withheld(status: number, error: unknown): { statusCode: number; code?: string; error: string; message: string } {
  const name = STATUS_CODES[status] ?? 'Server Error'
  const own = isRecord(error) ? error : {}
  const code = answerable(own) && isCode(own['code']) ? own['code'] : undefined
  return { statusCode: status, ...(code === undefined ? {} : { code }), error: name, message: name }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
