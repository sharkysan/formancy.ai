import { isModelRequestKind, modelBriefing } from '@formancy/builder-core'

/**
 * The deployment's own model, asked on a builder's behalf.
 *
 * The builders ask a model through an `AskModel` the host supplies, and a key in a browser
 * is a key anybody who opens the page can read. So a deployment that has a model keeps it
 * here, behind its own sessions, and the admin's `AskModel` is a request to this server
 * ([0166](../../../docs/decisions/0166-a-deployments-model-is-asked-through-its-server.md)).
 *
 * **The server writes the briefing.** The browser names the kind of request — one of the
 * three formancy makes — and sends the user part; the system part is the one
 * `@formancy/builder-core` briefs that kind with, and one in the request is never read, so
 * every request the operator's key pays for is asked under one of formancy's briefings.
 * That narrows the endpoint; it does not close it. The user part is still the person's
 * text, and nothing here stops it asking the model for something else under formancy's
 * briefing: the permission, the rate limit, the size cap and the output limit bound what
 * that costs, and the audit log says who asked.
 */

/** Everything a completion is asked: one system part and one user part, no conversation. */
export interface CompletionPrompt {
  readonly system: string
  readonly user: string
}

/**
 * Told when whoever asked has gone, so the request is abandoned at the provider rather than
 * paid for to the end.
 *
 * A callback rather than an `AbortSignal`, which this package's types do not have
 * ([0008](../../../docs/decisions/0008-layered-packages.md)) — the shape builder-core's
 * `AskTurn` has for the same reason. An adapter wires it in one line:
 * `const c = new AbortController(); cancellation.onCancel(() => c.abort())`.
 */
export interface Cancellation {
  /** Called at most once: when the asker goes, or at once if it already has. */
  onCancel(listener: () => void): void
}

/**
 * What one completion came to. Only the first is an answer.
 *
 * - `refused`: the provider declined in its response rather than in its text. `reason` is
 *   for the person, and ends their run as a decline
 *   ([0158](../../../docs/decisions/0158-a-model-may-decline.md)).
 * - `truncated`: the answer reached the output limit. Cut off, it is not an answer, and
 *   is never handed over as half a document.
 * - `unavailable`: not reached, or it answered with an error. `status` is the provider's
 *   HTTP status when it gave one; `cause` is for the operator's log, never the client.
 * - `cancelled`: the asker went away and the request was abandoned.
 */
export type Completion =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly failure: 'refused'; readonly reason: string }
  | { readonly ok: false; readonly failure: 'truncated' }
  | { readonly ok: false; readonly failure: 'unavailable'; readonly status?: number; readonly cause: string }
  | { readonly ok: false; readonly failure: 'cancelled' }

/**
 * A model, asked to complete one prompt.
 *
 * A port because what is behind it is genuinely swappable: the deployment chooses Anthropic,
 * OpenAI or xAI, `@formancy/server` has an adapter for each, and the tests drive the route
 * through doubles. **It does not throw for a provider's failure**; it says which failure.
 */
export interface Completer {
  complete(prompt: CompletionPrompt, cancellation: Cancellation): Promise<Completion>
}

/** A builder's request as the browser sends it, unread. */
export interface BuilderRequest {
  readonly kind?: unknown
  readonly user?: unknown
}

export type BuilderRequestOutcome =
  | Completion
  /** Not one of the requests formancy makes, so there is no briefing to ask it under. */
  | { readonly ok: false; readonly failure: 'unknown_kind' }
  /** No text to ask about: the briefing alone, which no run sends. */
  | { readonly ok: false; readonly failure: 'no_user' }

/**
 * Ask the deployment's model a builder's request, under the briefing for its kind.
 *
 * Whatever else the request carries is not read — a `system` above all. Resolves on every
 * ending: an adapter that throws broke its contract, and is still a model that could not
 * be asked.
 */
export async function completeBuilderRequest(
  completer: Completer,
  request: BuilderRequest,
  cancellation: Cancellation,
): Promise<BuilderRequestOutcome> {
  const { kind, user } = request
  if (!isModelRequestKind(kind)) return { ok: false, failure: 'unknown_kind' }
  if (typeof user !== 'string' || user.trim() === '') return { ok: false, failure: 'no_user' }

  try {
    return await completer.complete({ system: modelBriefing(kind), user }, cancellation)
  } catch (error) {
    return { ok: false, failure: 'unavailable', cause: error instanceof Error ? error.message : String(error) }
  }
}
