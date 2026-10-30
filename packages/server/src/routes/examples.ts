import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { keepExamples, readExamples } from '@formancy/server-core'
import type { Actor, KeepExamplesOutcome, ServerDeps } from '@formancy/server-core'

/**
 * A form's examples, and the sample they start from, kept beside the form (0166).
 *
 * `GET /f/:path/examples` answers `{ scenarios, sample? }`, with `unreadable` beside them when
 * something kept is not an example, and `PUT` replaces both with `{ scenarios, sample? }`. The routes authenticate and carry: who may read and change them, what an
 * example is, and what a publish says about them are `server-core`'s, so the 403 here is the
 * use-case's answer and not a `requires` of the route's own. Publishing needs nothing from
 * here — `publishForm` reads the examples itself, and its warnings ride on the `201`.
 *
 * One route family per plugin, the seam `app.ts`'s size budget names.
 */
export async function exampleRoutes(
  app: FastifyInstance,
  { deps, actorOf }: { deps: ServerDeps; actorOf: (request: FastifyRequest) => Promise<Actor | undefined> },
): Promise<void> {
  app.get('/f/:path/examples', async (request, reply) => {
    const actor = await actorOf(request)
    if (actor === undefined) return reply.code(401).send({ error: 'unauthenticated' })
    const { path } = request.params as { path: string }
    return answer(reply, await readExamples(deps, { path, actor }))
  })

  app.put('/f/:path/examples', async (request, reply) => {
    const actor = await actorOf(request)
    if (actor === undefined) return reply.code(401).send({ error: 'unauthenticated' })
    const { path } = request.params as { path: string }
    // The request's id, so the audit row written with the change names this request's line (0168).
    return answer(reply, await keepExamples(deps, { path, actor, examples: request.body, requestId: request.id }))
  })
}

/** An outcome as a response: the examples as kept, or the refusal, in the plane's shapes. */
function answer(reply: FastifyReply, outcome: KeepExamplesOutcome): FastifyReply {
  if (outcome.ok) return reply.send(outcome.examples)
  switch (outcome.kind) {
    case 'forbidden':
      // The body `requires` sends, so a client that handles one 403 handles this one.
      return reply.code(403).send({ error: 'forbidden', action: 'form.publish' })
    case 'unknown_form':
      return reply.code(404).send({ error: 'unknown_form' })
    case 'invalid_examples':
      // Each sentence names the example by position and name, and says what is wrong with it.
      return reply.code(422).send({ error: outcome.kind, problems: outcome.problems })
  }
}
