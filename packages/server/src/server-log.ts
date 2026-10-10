import { METHODS } from 'node:http'
import { LogController } from 'fastify'
import type { FastifyBaseLogger, FastifyReply, FastifyRequest, FastifyServerOptions } from 'fastify'
import { AUDIT_ACTIONS } from '@formancy/server-core'

/**
 * The server's log: a JSON line for every request, one for every error, and one for each
 * thing a route or a background worker has to say
 * ([0168](../../../docs/decisions/0168-the-log-is-built-from-a-list-of-fields.md)).
 *
 * **What keeps everything else out is construction, not a filter over text.** A line is made
 * from the fields `LOG_FIELDS` names, each kept only when its value is of that field's kind,
 * and from nothing else. A key a call hands over that is not on the list is never read, so a
 * body, a header, a query string, an answer, a password, a draft's key or a file's name has no
 * field to go in. The words of a call are never written at all — pino's message argument,
 * Fastify's `error.message`, its `Route GET:/the/raw/url not found` — so neither are the
 * parameters a database error quotes: a line says what happened with an `event` from
 * `LOG_EVENTS`, and a thrown error is written as its kind and its code.
 *
 * Its own logger rather than pino's options, because pino's rule for what to keep would be
 * three hooks — a log formatter, a bindings formatter and a method hook to drop the message —
 * whose order is pino's internals; here it is one function, `written`, and a list.
 */

/** Most severe first: `fatal` writes the least, `trace` the most. The names are pino's. */
export const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const
export type LogLevel = (typeof LOG_LEVELS)[number]

const SEVERITY: Readonly<Record<LogLevel, number>> = { fatal: 60, error: 50, warn: 40, info: 30, debug: 20, trace: 10 }

/** Where lines go: standard output in the server, an array in a test. */
export interface LogSink {
  write(line: string): unknown
}

/** What `createApp` is told to log: where, and from which level up. */
export interface ServerLogSettings {
  readonly sink: LogSink
  readonly level: LogLevel
}

/** What a line can say happened. Anything else is `unlisted`, or not written. */
export const LOG_EVENTS = [
  // Every request, once, when it has been answered.
  'request',
  // An error that answered a request: one the client caused (4xx), one the server did (5xx).
  'request.refused',
  'request.failed',
  // What a route says about something that went wrong beside its answer.
  'audit.unwritten',
  'upload.refused',
  'upload.unreleased',
  'scanner.unreachable',
  'model.unreachable',
  // A background worker's pass that threw. It comes back on its next tick.
  'outbox.failed',
  'collector.failed',
  'sweeper.failed',
  // What the database said beside an answer, by its code.
  'database.notice',
  // At warn and above, something that named no event on this list — Fastify's own
  // warnings — written without its words. Below warn it is not written.
  'unlisted',
] as const
export type LogEvent = (typeof LOG_EVENTS)[number]

/**
 * Every field a line can have, in the order it is written, each with the kind of value it
 * holds. A field is kept only when its value is of its kind, so a string in a number's place,
 * or a sentence in an identifier's, is dropped rather than written.
 */
const KINDS = {
  time: (value: unknown) => typeof value === 'string',
  level: (value: unknown) => (LOG_LEVELS as readonly unknown[]).includes(value),
  event: (value: unknown) => (LOG_EVENTS as readonly unknown[]).includes(value),
  // Fastify's own id, `req-` and a counter; never taken from a header, which Fastify 5 does
  // only when told to. The audit row of the same request carries it too.
  reqId: (value: unknown) => typeof value === 'string' && /^[\w-]{1,64}$/.test(value),
  method: (value: unknown) => typeof value === 'string' && METHODS.includes(value),
  // A route as the route table writes it, `/f/:path/drafts/:draftId`: never the path asked
  // for, and so never a form's path, a draft's id or a query string. Only `RequestLines`
  // sets it, from `request.routeOptions.url`.
  route: (value: unknown) => typeof value === 'string' && /^\/[\w\-./:*]*$/.test(value),
  status: isStatus,
  ms: (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0,
  // What a thrown error calls itself, and the first code along its causes.
  kind: isIdentifier,
  code: isCode,
  // The audit row that could not be written, by its action.
  action: (value: unknown) => (AUDIT_ACTIONS as readonly unknown[]).includes(value),
  // The status a model's provider answered with.
  upstream: isStatus,
} as const satisfies Record<string, (value: unknown) => boolean>

type Field = keyof typeof KINDS
export const LOG_FIELDS = Object.keys(KINDS) as readonly Field[]

/** A line before it is checked: anything in its fields, which `written` decides about. */
type Line = { readonly level: LogLevel; readonly event: LogEvent } & { readonly [F in Field]?: unknown }

/**
 * The one place a line becomes text: dropped below `level`, and otherwise each listed field
 * whose value is of its kind, in the listed order.
 */
function written(sink: LogSink, level: LogLevel): (line: Line) => void {
  const threshold = SEVERITY[level]
  return (line) => {
    if (SEVERITY[line.level] < threshold) return
    const kept: Partial<Record<Field, unknown>> = {}
    const given: { readonly [F in Field]?: unknown } = { ...line, time: new Date().toISOString() }
    for (const field of LOG_FIELDS) {
      if (KINDS[field](given[field])) kept[field] = given[field]
    }
    sink.write(`${JSON.stringify(kept)}\n`)
  }
}

/** A log whose every line is built by the rule above. What `createApp` hands Fastify. */
export function createServerLog(sink: LogSink, level: LogLevel): FastifyBaseLogger {
  return logger(written(sink, level), level, undefined)
}

/**
 * Fastify's logger interface over the rule: each call contributes its event, its error, and
 * the code, action and upstream status a caller may name, and nothing else it was handed. A
 * child keeps the request id it is bound to, which is how Fastify gives a request's lines its
 * id, and nothing else bound beside it.
 */
function logger(write: (line: Line) => void, level: LogLevel, reqId: unknown): FastifyBaseLogger {
  const at =
    (lineLevel: LogLevel) =>
    (first?: unknown): void => {
      const given = (first instanceof Error ? { err: first } : isRecord(first) ? first : {}) as Record<string, unknown>
      const event = given['event'] !== 'unlisted' && KINDS.event(given['event']) ? (given['event'] as LogEvent) : undefined
      // Below warn, a line nobody named is Fastify saying it is listening or that a route was
      // not found: nothing an operator reads, and the words are a raw URL.
      if (event === undefined && SEVERITY[lineLevel] < SEVERITY.warn) return
      write({
        level: lineLevel,
        event: event ?? 'unlisted',
        reqId,
        code: given['code'],
        ...described(given['err']),
        action: given['action'],
        upstream: given['upstream'],
      })
    }
  return {
    level,
    fatal: at('fatal'),
    error: at('error'),
    warn: at('warn'),
    info: at('info'),
    debug: at('debug'),
    trace: at('trace'),
    silent: () => undefined,
    child: (bindings) => logger(write, level, KINDS.reqId(bindings['reqId']) ? bindings['reqId'] : reqId),
  }
}

/**
 * When Fastify writes about a request, written as this log's lines: Fastify's own extension
 * point for its internal lines, rather than hooks beside a logger that also writes them.
 *
 * One line when a request is answered, not one when it arrives as well — half the lines,
 * and the one that has the status. A route nobody registered gets no line of its own: its
 * request line says 404 and names no route.
 */
class RequestLines extends LogController {
  readonly #write: (line: Line) => void

  constructor(write: (line: Line) => void) {
    super()
    this.#write = write
  }

  override incomingRequest(): void {}

  override routeNotFound(): void {}

  override requestCompleted(error: Error | null | undefined, request: FastifyRequest, reply: FastifyReply): void {
    this.#write({
      level: error == null ? 'info' : 'error',
      event: 'request',
      ...where(request),
      status: reply.statusCode,
      ms: Math.round(reply.elapsedTime),
      ...described(error),
    })
  }

  override defaultErrorLog(error: Error, request: FastifyRequest, reply: FastifyReply): void {
    const failed = reply.statusCode >= 500
    this.#write({
      level: failed ? 'error' : 'info',
      event: failed ? 'request.failed' : 'request.refused',
      ...where(request),
      status: reply.statusCode,
      ...described(error),
    })
  }
}

function where(request: FastifyRequest): { reqId: string; method: string; route: string | undefined } {
  return { reqId: request.id, method: request.method, route: request.routeOptions.url }
}

/**
 * Fastify's options for a server that keeps this log, or none for one that keeps no log —
 * `createApp` given no `log`, which is how a host embedding it keeps its own output (0115).
 */
export function serverLogOptions(
  log: ServerLogSettings | undefined,
): Pick<FastifyServerOptions, 'loggerInstance' | 'logController'> {
  if (log === undefined) return {}
  const write = written(log.sink, log.level)
  return { loggerInstance: logger(write, log.level, undefined), logController: new RequestLines(write) }
}

/**
 * What a thrown thing is, from what it calls itself: its class, and the first code along its
 * causes — Drizzle wraps PostgreSQL's error, whose SQLSTATE is the useful part. Never its
 * message or its stack, whose first line is the message.
 */
function described(error: unknown): { kind?: string; code?: string } {
  if (!(error instanceof Error)) return {}
  let code: string | undefined
  let at: unknown = error
  for (let depth = 0; code === undefined && at instanceof Error && depth < 4; depth += 1) {
    const own = (at as { code?: unknown }).code
    if (isCode(own)) code = own
    at = at.cause
  }
  return { kind: kindOf(error), ...(code === undefined ? {} : { code }) }
}

/** `name`, which most errors set; a class that leaves it as `Error` by its constructor. */
function kindOf(error: Error): string {
  if (error.name !== 'Error' && isIdentifier(error.name)) return error.name
  const constructed: unknown = error.constructor.name
  return isIdentifier(constructed) ? constructed : 'Error'
}

function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z_$][\w$]{0,63}$/.test(value)
}

/** `ECONNREFUSED`, `22P02`, `FST_ERR_CTP_BODY_TOO_LARGE`: capitals, digits and underscores. */
function isCode(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Z0-9_]{1,64}$/.test(value)
}

function isStatus(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** What a background worker complains through. */
export type WorkerLog = Pick<FastifyBaseLogger, 'error'>

/**
 * The log a worker was given, or one writing its failures to standard error by the same rule:
 * where they went before there was a log, and so where a host that starts a worker without
 * one still finds them.
 */
export function workerLog(given: WorkerLog | undefined): WorkerLog {
  return given ?? createServerLog(process.stderr, 'error')
}

/**
 * What the database says beside its answers, as lines by the same rule: its SQLSTATE, never
 * its words. postgres.js prints each notice whole to standard output unless it is handed
 * somewhere else to put it, and the bootstrap draws one on every start for each table, column
 * and trigger that already exists. Those are `debug`; a `WARNING` is `warn`. With no log,
 * nowhere.
 */
export function databaseNotices(
  log: FastifyBaseLogger | undefined,
): (notice: Readonly<Record<string, unknown>>) => void {
  return (notice) => {
    if (log === undefined) return
    const line = { event: 'database.notice', code: notice['code'] }
    if (notice['severity'] === 'WARNING') log.warn(line)
    else log.debug(line)
  }
}
