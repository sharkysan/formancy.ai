import { createFormEngine } from '@formancy/core'
import { checkMembership } from './options-membership.js'
import { maySubmit } from './access.js'
import { filesToClaim } from './uploads.js'
import { resolveForm } from './use-cases.js'
import type { ResolvedForm } from './use-cases.js'
import type { ServerDeps } from './deps.js'

/**
 * Submitting a form: the replay, and what is stored.
 *
 * Its own file because `use-cases.ts` named it as the next family to leave when its size
 * budget refused growth, and the submission is what grew.
 */

export type SubmissionOutcome =
  | { ok: true; id: string; canonicalData: unknown }
  | { ok: false; kind: 'unknown_form' }
  | { ok: false; kind: 'version_changed'; current?: ResolvedForm }
  | { ok: false; kind: 'invalid'; errors: Record<string, string[]> }
  /** The caller may not submit this form: not public, or not from this origin. */
  | { ok: false; kind: 'forbidden' }
  /**
   * A source that should have vouched for an answer could not.
   *
   * Failed closed and never accepted unchecked: a bogus value that is stored is
   * undetectable afterwards, while a refusal is retryable and the draft still holds
   * the answers.
   */
  | { ok: false; kind: 'source_unavailable'; source: string }

/**
 * Accept one submission: resolve the version the client says it rendered,
 * replay the engine over the submitted data, and store the CANONICAL result.
 *
 * The replay is the whole point. Computed values are recomputed and overwrite
 * whatever arrived; visibility is evaluated server-side and hidden branches
 * are stripped, so a client cannot smuggle data by lying about what was shown.
 * Client validation is UX; this is truth.
 */
export async function createSubmission(
  deps: ServerDeps,
  input: {
    path: string
    declaredSchemaHash: string
    data: unknown
    /** Defaults to anonymous: the caller must prove otherwise, not the reverse. */
    actor?: 'anonymous' | 'authenticated'
    origin?: string
    requestId?: string
  },
): Promise<SubmissionOutcome> {
  const form = await deps.storage.getFormByPath(input.path)
  if (form === undefined) return { ok: false, kind: 'unknown_form' }

  if (!maySubmit(form, input.actor ?? 'anonymous', input.origin)) {
    return { ok: false, kind: 'forbidden' }
  }

  const current = await resolveForm(deps, input.path)
  if (current === undefined) return { ok: false, kind: 'unknown_form' }

  if (input.declaredSchemaHash !== current.schemaHash) {
    // The thin slice's staleVersionPolicy is `reject`: the acceptCompatible
    // policy arrives with draft migration, driven by diffSchemas severity.
    return { ok: false, kind: 'version_changed', current }
  }

  const engine = createFormEngine({
    schema: current.schema,
    initialValue: input.data,
    capabilities: deps.capabilities,
    // The side this replay is, which was never said. Without it the server ran
    // as a CLIENT: a `runsOn: "server"` rule was skipped in the one place it was
    // meant to run and a `runsOn: "client"` rule ran in the one place it was
    // meant not to — both halves of [0043] backwards, in the product, with
    // nothing reporting it.
    mode: 'server',
    ...(deps.checks === undefined ? {} : { checks: deps.checks }),
  })
  // Checks are asked by the engine and answered later. Awaiting before `submit`
  // is what makes the server the authority on them rather than a second opinion
  // that happened to be quick.
  await engine.settle()
  const outcome = engine.submit()
  if (!outcome.ok) return { ok: false, kind: 'invalid', errors: outcome.errors }

  // Asked AFTER the engine and BEFORE anything is written, so a refusal stores
  // nothing. The engine cannot do this itself: a `optionsSource` field has no
  // document options to compare against, which is exactly what naming a source
  // means.
  const membership = await checkMembership(current.schema, engine.value(), deps.optionsSources)
  if (!membership.ok) {
    return membership.kind === 'invalid'
      ? { ok: false, kind: 'invalid', errors: membership.errors }
      : { ok: false, kind: 'source_unavailable', source: membership.source }
  }

  const id = deps.newId()

  // Queued in the SAME call that stores the submission, so one COMMIT decides
  // both. Posting after the insert returns gives the two failures a
  // self-hoster cannot debug: the webhook fired and the submission rolled
  // back, or the submission is stored and nothing was ever sent.
  const hooks = await deps.storage.webhooksForForm(current.formId)
  // The CANONICAL value, not the request body: the receiver sees what was
  // stored, with computed fields recomputed and hidden branches stripped.
  const body = JSON.stringify({ id, form: input.path, data: engine.value() })
  const queued = hooks.map((hook) => ({
    id: deps.newId(),
    webhookId: hook.id,
    submissionId: id,
    // Stable for every retry of this delivery, which is what lets a receiver
    // dedupe. A fresh id per attempt would turn our retry into their duplicate.
    eventId: deps.newId(),
    body,
    attempt: 0,
    nextAttemptAt: deps.nowIso(),
    state: 'pending' as const,
    lastError: null,
  }))

  // Checked before the insert and claimed inside it. A submission naming a
  // file that is not hers is not a submission.
  const claimable = await filesToClaim(deps.storage, {
    schema: current.schema,
    formId: current.formId,
    data: engine.value(),
  })
  if (!claimable.ok) {
    return {
      ok: false,
      kind: 'invalid',
      errors: {
        _files: [`unknown_file:${claimable.unknown.join(',')}`],
      },
    }
  }

  const at = deps.nowIso()
  await deps.storage.insertSubmission(
    {
      id,
      formId: current.formId,
      formVersionId: current.versionId,
      data: engine.value(),
      submittedAt: at,
    },
    queued,
    claimable.ids,
    // In the transaction, not after it: a submission that rolled back must
    // leave nothing behind saying it happened, and an audit row for a
    // submission nobody can find is worse than no row at all.
    //
    // No actor id — this route accepts anonymous submissions, and who
    // submitted is the form's own data rather than the audit log's business.
    // `actor` says only whether anybody was signed in.
    {
      id: deps.newId(),
      at,
      action: 'submission.created',
      subject: input.path,
      ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
      // The version, so a reader can tell which schema this answered without
      // joining. Never the answers.
      detail: {
        submissionId: id,
        version: current.version,
        authenticated: input.actor === 'authenticated',
      },
    },
  )
  return { ok: true, id, canonicalData: engine.value() }
}
