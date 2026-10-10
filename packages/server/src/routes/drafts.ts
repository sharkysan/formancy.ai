import type { FastifyInstance } from 'fastify'
import { resumeDraft, saveDraft, startDraft } from '@formancy/server-core'
import type { ServerDeps } from '@formancy/server-core'

/** Proves the bearer started this draft. Lower-case: Fastify normalises. */
const DRAFT_TOKEN_HEADER = 'x-formancy-draft-token'

/**
 * A respondent's draft: started, written and read back, each with the key only its starter
 * holds ([0062](../../../../docs/decisions/0062-a-draft-carries-its-own-key.md)).
 *
 * One route family per plugin, the seam `app.ts`'s size budget names. It moved when the
 * deployment's model needed lines that file had no room for.
 */
export async function draftRoutes(
  app: FastifyInstance,
  { deps, limit }: { deps: ServerDeps; limit: { max: number; timeWindowMs: number } },
): Promise<void> {
  /**
   * Start a draft, and get the only key to it.
   *
   * The public plane is anonymous, so a draft has no account behind it. It was
   * previously addressed by an id the CALLER chose, with no check on either
   * route: anybody who knew or guessed an id could read a stranger's part-filled
   * form, and overwrite it — after which that person submits the substituted
   * content under their own name and nothing says otherwise
   * ([0062](../../../../docs/decisions/0062-a-draft-carries-its-own-key.md)).
   *
   * So the server picks the id and signs it, and the token comes back exactly
   * once. Losing it means losing the draft, which is the correct trade for the
   * alternative.
   */
  app.post(
    '/f/:path/drafts',
    {
      // Unauthenticated, like the submission route, and every call hands out a
      // key. Cheap per call, but nothing should be free on the public plane.
      config: { rateLimit: { max: limit.max, timeWindow: limit.timeWindowMs } },
    },
    async (request, reply) => {
      const { path } = request.params as { path: string }
      const started = await startDraft(deps, { path })
      if (started === undefined) return reply.code(404).send({ error: 'unknown_form' })
      return reply.code(201).send(started)
    },
  )

  app.put(
    '/f/:path/drafts/:draftId',
    {
      // A database row per request, reachable without an account. The submission
      // route used to be described as "the one unauthenticated write in the
      // product"; that stopped being true when drafts were exposed here, and
      // nobody moved the limit across.
      config: { rateLimit: { max: limit.max, timeWindow: limit.timeWindowMs } },
    },
    async (request, reply) => {
      const { path, draftId } = request.params as { path: string; draftId: string }
      const token = request.headers[DRAFT_TOKEN_HEADER]
      if (typeof token !== 'string') {
        return reply.code(401).send({ error: 'draft_token_required' })
      }

      const saved = await saveDraft(deps, { path, draftId, token, data: request.body ?? {} })
      if (saved === undefined) return reply.code(404).send({ error: 'unknown_form' })
      if (!saved.saved) return reply.code(403).send({ error: 'draft_token_invalid' })
      return reply.send({ version: saved.version })
    },
  )

  app.get(
    '/f/:path/drafts/:draftId',
    {
      // Limited because this is where a token would be tried one after another.
      // An HMAC is not realistically guessable, but limiting the write and
      // leaving the guess surface open is not a position worth defending.
      config: { rateLimit: { max: limit.max, timeWindow: limit.timeWindowMs } },
    },
    async (request, reply) => {
      const { path, draftId } = request.params as { path: string; draftId: string }
      const token = request.headers[DRAFT_TOKEN_HEADER]
      if (typeof token !== 'string') {
        return reply.code(401).send({ error: 'draft_token_required' })
      }

      const resumed = await resumeDraft(deps, { path, draftId, token })
      // 404 for a wrong token as well as a missing draft. Answering differently
      // would confirm which ids exist, which is the enumeration this closed.
      if (resumed === undefined) return reply.code(404).send({ error: 'unknown_draft' })
      return reply.send(resumed)
    },
  )
}
