import type { FastifyInstance } from 'fastify'

/**
 * A body with a NUL character in it is refused as malformed
 * ([0173](../../../docs/decisions/0173-a-nul-character-names-nothing-and-a-body-with-one-is-refused.md)).
 *
 * PostgreSQL holds no U+0000 in `text`, `22021`, nor in `jsonb`, `22P05`, so a string with one
 * can be kept nowhere this server keeps anything: an answer, a draft, a schema, an example, a
 * file's name or type, an origin, an email, a key's name. Each was a `500` where its route
 * wrote it, and a line at `error`. Refused here, once, on the root instance before any route,
 * so every route and every plugin's context has it and a route added later needs nothing of
 * its own.
 *
 * In `preValidation`, which is after the body is parsed — by whichever parser the request's
 * type chose, so a `text/plain` string is looked at as well as JSON — and before any route's
 * own `preHandler`. That makes it what a body that does not parse is: answered by the body
 * alone, whoever sent it and whatever accounts exist, before a session is asked for. A file's
 * bytes arrive as a `Buffer` and are not looked at; a NUL byte is ordinary in a file.
 *
 * The answer is the route plane's shape for a refusal, with the JSON Pointer (RFC 6901) to the
 * string or the member's name the NUL is in, so a client can say which answer to correct.
 */
export function refuseNulCharacters(app: FastifyInstance): void {
  app.addHook('preValidation', async (request, reply) => {
    const pointer = nulAt(request.body)
    if (pointer === undefined) return
    return reply.code(400).send({
      error: 'nul_character',
      pointer,
      message: `The NUL character (U+0000) is in no string this server accepts, and this request's body has one at ${
        pointer === '' ? 'the body itself' : pointer
      }.`,
    })
  })
}

/** Where a container sits: the member or index of the one above it that holds it. */
interface Step {
  readonly up: Step | undefined
  readonly key: string | number
}

/**
 * The JSON Pointer to the first string or member name in `body` with a NUL in it, in the order
 * the body was written, or `undefined` when there is none.
 *
 * A loop over a stack of its own rather than a recursion: `JSON.parse` takes a body nested
 * deeper than the call stack goes, and a walk that threw on it would make that body a `500` on
 * every route. And every body is walked, so nothing is built for a value on the way — a step
 * for each container, and the pointer only for the string it finds. Building a pointer for
 * every value made the walk of a body at the cap take longer than parsing it.
 */
function nulAt(body: unknown): string | undefined {
  // Three stacks in step: a value, the container it is in, and its key there.
  const values: unknown[] = [body]
  const containers: Array<Step | undefined> = [undefined]
  const keys: Array<string | number | undefined> = [undefined]
  while (values.length > 0) {
    const value = values.pop()
    const container = containers.pop()
    const key = keys.pop()
    if (typeof value === 'string') {
      if (value.includes('\u0000')) return pointer(container, key)
      continue
    }
    const here = key === undefined ? container : { up: container, key }
    if (Array.isArray(value)) {
      for (let index = value.length - 1; index >= 0; index -= 1) {
        values.push(value[index])
        containers.push(here)
        keys.push(index)
      }
    } else if (isPlainObject(value)) {
      const names = Object.keys(value)
      for (let index = names.length - 1; index >= 0; index -= 1) {
        const name = names[index]!
        values.push(value[name])
        containers.push(here)
        keys.push(name)
        // The name before what it names, which the stack pops first; both point at the member.
        if (name.includes('\u0000')) {
          values.push(name)
          containers.push(here)
          keys.push(name)
        }
      }
    }
  }
  return undefined
}

/** RFC 6901's spelling of the place `key` names in `container`: '' for the body itself. */
function pointer(container: Step | undefined, key: string | number | undefined): string {
  const steps: Array<string | number> = []
  for (let at = key === undefined ? container : { up: container, key }; at !== undefined; at = at.up) steps.push(at.key)
  return steps.reverse().map((step) => `/${typeof step === 'number' ? String(step) : token(step)}`).join('')
}

/** A member's name as one step of a JSON Pointer: `~` and `/` escaped, as RFC 6901 has them. */
function token(name: string): string {
  return name.replaceAll('~', '~0').replaceAll('/', '~1')
}

/** What a parser makes of a JSON object, and nothing else — not a `Buffer`, not a stream. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false
  const prototype: unknown = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}
