import type { FastifyInstance, FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify'
import { MODEL_REQUEST_KINDS } from '@formancy/builder-core'
import { completeBuilderRequest } from '@formancy/server-core'
import type {
  Actor,
  AuditDraft,
  BuilderRequest,
  BuilderRequestOutcome,
  Cancellation,
  Completer,
} from '@formancy/server-core'
import type { ModelProvider } from '../model-settings.js'

/** The deployment's model: which provider, which model, and the adapter that asks it. */
export interface DeploymentModel {
  readonly provider: ModelProvider
  readonly model: string
  readonly completer: Completer
}

/**
 * The largest request the route reads, in bytes, set on the route rather than inherited.
 *
 * Every byte is an input token the operator pays for, so the cap is the route's own:
 * raising the server's limit for something else does not raise what an editor can send a
 * model. It has to hold what the builders send about a form the server publishes, and the
 * largest of that is a translation, not the form: each answer's row repeats the question
 * it answers as its context, pretty-printed and escaped again as a string.
 * `model-route.test.ts` sends all three requests about the largest questionnaire the server's
 * default limit publishes, its questions a sentence long, and they are taken. Longer
 * questions over many answers make a translation past this, refused before it is read (0165).
 */
export const MODEL_BODY_LIMIT_BYTES = 1024 * 1024

/**
 * The builders' requests to the deployment's model (0165).
 *
 * `GET /model` says whether there is one, and which, to somebody who may edit a form: the
 * admin draws the prompt pane only when there is. `POST /model/complete` takes
 * `{ kind, user }` and answers `{ text }` — the model's answer, for the browser to check
 * — or `{ declined }` when the provider refused, which the admin's `AskModel` hands back as
 * a decline (0158). Everything else is an error with a sentence for the person.
 *
 * One route family per plugin, the seam `app.ts`'s size budget names.
 */
export async function modelRoutes(
  app: FastifyInstance,
  {
    model,
    requires,
    audit,
    limit,
  }: {
    model: DeploymentModel | undefined
    requires: (action: 'form.publish') => preHandlerHookHandler
    audit: (request: FastifyRequest, draft: AuditDraft) => Promise<void>
    limit: { max: number; timeWindowMs: number }
  },
): Promise<void> {
  // Asking a model is part of editing a form, so it takes the permission editing does:
  // `form.publish`, which an editor and an admin hold and a viewer does not.
  app.get('/model', { preHandler: requires('form.publish') }, async (_request, reply) => {
    if (model === undefined) return reply.code(404).send({ error: 'model_not_configured' })
    return reply.send({ provider: model.provider, model: model.model })
  })

  app.post(
    '/model/complete',
    {
      preHandler: requires('form.publish'),
      bodyLimit: MODEL_BODY_LIMIT_BYTES,
      config: {
        rateLimit: {
          max: limit.max,
          timeWindow: limit.timeWindowMs,
          // After `requires`, so the count is per session: an office behind one address is
          // not one budget, and one editor cannot spend another's. A request refused for
          // its session spends nothing.
          hook: 'preHandler',
          keyGenerator: (request) => {
            const actor = (request as FastifyRequest & { actor?: Actor }).actor
            return actor === undefined ? `ip:${request.ip}` : `${actor.kind}:${actor.id}`
          },
        },
      },
    },
    async (request, reply) => {
      if (model === undefined) return reply.code(404).send({ error: 'model_not_configured' })
      const body = (request.body ?? {}) as BuilderRequest

      const outcome = await completeBuilderRequest(model.completer, body, cancelledWith(reply))

      if (outcome.ok || (outcome.failure !== 'unknown_kind' && outcome.failure !== 'no_user')) {
        // Asked: the form went to the provider, at the operator's cost. The kind and the
        // size, never the text (0057).
        await audit(request, {
          action: 'model.asked',
          subject: String(body.kind),
          detail: {
            provider: model.provider,
            model: model.model,
            characters: String(body.user).length,
            outcome: outcome.ok ? 'answered' : outcome.failure,
            // The provider's status, which is all an operator has to go on: the server
            // keeps no request log (SAFETY-ANALYSIS C3), and its words go nowhere.
            ...(!outcome.ok && outcome.failure === 'unavailable' && outcome.status !== undefined
              ? { status: outcome.status }
              : {}),
          },
        })
      }
      return answer(reply, request, outcome)
    },
  )
}

/**
 * The browser going away, as a cancellation: the response closing before it was written.
 *
 * Every response closes, so one that finished is not a browser that left; only a close
 * with nothing written yet tells the adapter to abandon the request at the provider.
 *
 * A browser can also have gone before the handler ran, while the session or an API key was
 * still being checked. That response has closed already and will not close again, so it
 * is read as gone from the start, and the adapter is told at once — before it sends.
 */
function cancelledWith(reply: FastifyReply): Cancellation {
  let gone = reply.raw.destroyed && !reply.raw.writableFinished
  const listeners: Array<() => void> = []
  reply.raw.once('close', () => {
    if (reply.raw.writableFinished) return
    gone = true
    for (const listener of listeners.splice(0)) listener()
  })
  return {
    onCancel(listener) {
      if (gone) listener()
      else listeners.push(listener)
    },
  }
}

/** An outcome as a response, every failure with a sentence for the person reading it. */
function answer(reply: FastifyReply, request: FastifyRequest, outcome: BuilderRequestOutcome): FastifyReply {
  if (outcome.ok) return reply.send({ text: outcome.text })
  switch (outcome.failure) {
    case 'unknown_kind':
      return reply.code(400).send({
        error: 'unknown_kind',
        message: `kind must be one of ${MODEL_REQUEST_KINDS.join(', ')}: the requests formancy makes of a model.`,
      })
    case 'no_user':
      return reply
        .code(400)
        .send({ error: 'bad_request', message: 'Body needs { kind, user }, user being the text to ask.' })
    case 'refused':
      return reply.send({ declined: outcome.reason })
    case 'truncated':
      return reply.code(502).send({
        error: 'model_truncated',
        message: 'The model’s answer reached its length limit and was cut off, so it was not used.',
      })
    case 'cancelled':
      // Nobody is there to read it.
      return reply.code(499).send({ error: 'cancelled' })
    case 'unavailable':
      // The provider's own words can name the account, so they stay on the server — written
      // to a logger only if one is configured, which by default none is (C3).
      request.log.error({ status: outcome.status, cause: outcome.cause }, 'the model could not be asked')
      return reply.code(502).send({ error: 'model_unavailable', message: unavailableSentence(outcome.status) })
  }
}

/** What a provider's status means for the person whose turn it ended. */
function unavailableSentence(status: number | undefined): string {
  if (status === 401 || status === 403) return 'The model service refused this server’s key.'
  if (status === 429) return 'The model service is limiting this server’s requests. Try again in a while.'
  if (status === 400 || status === 404) {
    return 'The model service refused the request: the model this server names may not exist, or may not take it.'
  }
  return 'The model service could not be reached, or answered with an error.'
}
