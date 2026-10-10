import type { FastifyInstance, FastifyRequest } from 'fastify'
import { createSubmission, decodeSolution, mintChallenge, resolveForm, verifySolution } from '@formancy/server-core'
import type { Actor, ServerDeps } from '@formancy/server-core'
import { CHALLENGE_HEADER, SCHEMA_HASH_HEADER } from '../headers.js'

/**
 * What a respondent's browser does with a form: read it, ask for a challenge, and submit it.
 *
 * One route family per plugin, the seam `app.ts`'s size budget names. It moved when the
 * submission token needed lines that file had no room for.
 */
export async function submissionRoutes(
  app: FastifyInstance,
  {
    deps,
    challengeSecret,
    limit,
    actorOf,
  }: {
    deps: ServerDeps
    /** Absent, the challenge is off: its route answers 404 and no submission is asked for one. */
    challengeSecret: string | undefined
    limit: { max: number; timeWindowMs: number }
    actorOf: (request: FastifyRequest) => Promise<Actor | undefined>
  },
): Promise<void> {
  const submissionLimit = limit

  /**
   * Fetch a published form. The one public route deliberately NOT rate-limited.
   *
   * Every other unauthenticated route is: submitting, starting a draft, writing
   * one, reading one, minting a challenge, asking for an upload target. Those are
   * writes, or guesses, or work somebody can demand of the server. This is the
   * read every visitor has to make before they can do anything at all.
   *
   * Limiting it by IP would refuse the form to real people sharing an address —
   * an office, a school, a phone network behind CGNAT — and the failure would
   * look like the form being broken rather than like a limit. That is a worse
   * outcome than the cheap read it would prevent, and the read is cached by
   * `schemaHash` anyway.
   *
   * Written down because the asymmetry is deliberate and looks like an omission.
   */
  app.get('/f/:path', async (request, reply) => {
    const { path } = request.params as { path: string }
    const resolved = await resolveForm(deps, path)
    if (resolved === undefined) return reply.code(404).send({ error: 'unknown_form' })
    return reply.send({
      version: resolved.version,
      schemaHash: resolved.schemaHash,
      schema: resolved.schema,
    })
  })

  /**
   * A puzzle for an anonymous visitor to solve before submitting.
   *
   * Public because the form is: requiring a session to obtain a challenge for
   * an unauthenticated submission would be a circle. It is cheap to mint and
   * stateless, so handing one out costs this server a hash.
   */
  app.get(
    '/f/:path/challenge',
    {
      // One per submission attempt is the legitimate rate, so the submission
      // limit is the right one. The point of a proof of work is that the
      // ATTACKER pays; handing out unlimited puzzles for free is the one part
      // of it that costs us instead.
      config: { rateLimit: { max: submissionLimit.max, timeWindow: submissionLimit.timeWindowMs } },
    },
    async (request, reply) => {
      if (challengeSecret === undefined) {
        // Not configured is not an error: a deployment may decide its forms are
        // not public enough to need one, and the field should say so rather
        // than fail.
        return reply.code(404).send({ error: 'challenge_not_enabled' })
      }
      const { path } = request.params as { path: string }
      const form = await deps.storage.getFormByPath(path)
      if (form === undefined) return reply.code(404).send({ error: 'unknown_form' })

      return reply.send(
        await mintChallenge({
          secret: challengeSecret,
          nowSeconds: Math.floor(new Date(deps.nowIso()).getTime() / 1000),
        }),
      )
    },
  )

  app.post(
    '/f/:path/submissions',
    {
      // The unauthenticated write that matters most, and no longer the only
      // one: drafts write too, and are limited the same way. Keyed by IP, which
      // is the only identity an anonymous submitter has — behind a proxy, only
      // once `trustProxy` names it; until then it is the proxy's.
      config: { rateLimit: { max: submissionLimit.max, timeWindow: submissionLimit.timeWindowMs } },
    },
    async (request, reply) => {
      const { path } = request.params as { path: string }
      const declaredSchemaHash = request.headers[SCHEMA_HASH_HEADER]
      if (typeof declaredSchemaHash !== 'string' || declaredSchemaHash === '') {
        return reply.code(400).send({
          error: 'missing_schema_hash',
          message: `Send the schema hash you rendered in the ${SCHEMA_HASH_HEADER} header.`,
        })
      }

      // The public plane is public, so an identity is optional here — but if one
      // is presented and valid, the access policy does not apply to it. An
      // invalid credential is treated as no credential rather than as an error:
      // this route's job is to accept submissions, not to adjudicate logins.
      const actor = await actorOf(request)
      const origin = request.headers.origin

      // Before the engine runs, and only for a visitor who is not signed in.
      // Somebody with a session has already paid a cost the challenge is a
      // substitute for, and making them solve a puzzle as well would be
      // ceremony — while an anonymous submission is the surface this exists
      // to protect.
      if (challengeSecret !== undefined && actor === undefined) {
        const refusal = await checkChallenge(deps, challengeSecret, request)
        if (refusal !== undefined) return reply.code(400).send(refusal)
      }

      const outcome = await createSubmission(deps, {
        path,
        declaredSchemaHash,
        requestId: request.id,
        data: request.body ?? {},
        actor: actor === undefined ? 'anonymous' : 'authenticated',
        ...(typeof origin === 'string' ? { origin } : {}),
      })

      if (outcome.ok) return reply.code(201).send({ id: outcome.id, data: outcome.canonicalData })

      switch (outcome.kind) {
        case 'unknown_form':
          return reply.code(404).send({ error: 'unknown_form' })
        case 'version_changed':
          // 409 carries the CURRENT schema so the client can re-render and
          // preserve what it can, instead of guessing why it was refused.
          return reply.code(409).send({
            error: 'FORM_VERSION_CHANGED',
            current:
              outcome.current === undefined
                ? undefined
                : {
                    version: outcome.current.version,
                    schemaHash: outcome.current.schemaHash,
                    schema: outcome.current.schema,
                  },
          })
        case 'invalid':
          // The identical error shape the client's engine produces, so server
          // errors render through the same code path as local ones.
          return reply.code(422).send({ error: 'invalid', errors: outcome.errors })
        case 'forbidden':
          // Deliberately says nothing about WHICH rule refused. "Not public" and
          // "not from your origin" are the same answer to someone probing.
          return reply.code(403).send({ error: 'forbidden' })
        case 'source_unavailable':
          // 503 and not 422: nothing about the submission is wrong, a list this
          // deployment owns could not vouch for it. Retryable, and the draft still
          // holds the answers — where accepting the value unchecked would store
          // something nobody can detect afterwards.
          return reply.code(503).send({ error: 'source_unavailable', source: outcome.source })
      }
    },
  )
}

/**
 * Check a submitted solution, and spend it.
 *
 * Returns the refusal to send, or undefined when it passed. The spend is
 * separate from the verification and comes last: the stateless checks say
 * the solution is correct, and only the database can say it has not been
 * used — a correct solution stays correct, so without this one puzzle
 * would buy a thousand submissions.
 */
async function checkChallenge(
  deps: ServerDeps,
  challengeSecret: string,
  request: FastifyRequest,
): Promise<{ error: string; message: string } | undefined> {
  const header = request.headers[CHALLENGE_HEADER]
  if (typeof header !== 'string' || header === '') {
    return {
      error: 'challenge_required',
      message: `This form needs a solved challenge. Ask GET /f/:path/challenge for one and return it in ${CHALLENGE_HEADER}.`,
    }
  }

  const solution = decodeSolution(header)
  if (solution === undefined) {
    return { error: 'challenge_malformed', message: 'The challenge header is not base64 JSON.' }
  }

  const nowSeconds = Math.floor(new Date(deps.nowIso()).getTime() / 1000)
  const verified = await verifySolution(challengeSecret, solution, nowSeconds)
  if (!verified.ok) {
    return {
      error: `challenge_${verified.reason}`,
      message: 'The challenge was not solved. Ask for a new one and try again.',
    }
  }

  // The expiry comes back from verification rather than being parsed out of
  // the salt a second time — one place reads that format.
  const spent = await deps.storage.spendChallenge(
    verified.challenge,
    new Date(verified.expiresAtSeconds * 1000).toISOString(),
  )
  if (!spent) {
    return {
      error: 'challenge_spent',
      message: 'That challenge has already been used. Each one is good for one submission.',
    }
  }
  return undefined
}
