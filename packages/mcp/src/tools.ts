import { authoringFacts, diffSchemas, schemaHash } from '@formancy/spec'
import { validateSchema } from '@formancy/spec/validate'
import type { Change, FormSchema } from '@formancy/spec'
import { engineRefusal, expressionProblems, runScenarios } from '@formancy/core'
import type { Scenario } from '@formancy/core'

/**
 * What formancy can be asked to do by a coding agent, as plain functions.
 *
 * Separated from the MCP server itself for the same reason `server-core` is separated
 * from `server`: a use-case that can only be exercised through a transport is one nobody
 * can test. Everything here is a function from JSON to JSON.
 *
 * **The tools check first and act second.** `publish_form` validates locally before it
 * opens a socket, so an invalid document never reaches the server and the model gets the
 * reason rather than a 422. That is possible because the format has a published JSON
 * Schema and the expressions are statically type-checked — a generated document is
 * checkable before anything is done with it.
 */

/** A tool's answer: what happened, and what the agent should do about it. */
export interface ToolResult {
  /** False means the agent must fix something before trying again. */
  readonly ok: boolean
  /** Prose for the model. Written to be acted on, not logged. */
  readonly summary: string
  /** The machine-readable part, when there is one. */
  readonly data?: unknown
}

/** Where a formancy server is, and how to prove who you are to it. */
export interface ServerAccess {
  readonly baseUrl: string
  readonly apiKey: string
  /** Injected so tests do not need a socket. */
  readonly fetch?: typeof globalThis.fetch
}

// ---------------------------------------------------------------- local tools

/**
 * Everything the spec allows, so a model does not have to guess.
 *
 * The cheapest tool here and probably the most valuable: without it a model
 * invents `type: "phone"` or `type: "email"` from its memory of other form
 * builders, gets a validation error, and burns a turn finding out that `text`
 * with `format: "email"` is the answer. Told up front, it does not.
 */
export function describeSpec(): ToolResult {
  const facts = authoringFacts()
  return {
    ok: true,
    summary:
      `formancy speaks spec versions ${facts.specVersions.join(' and ')}; new documents should ` +
      `use "${facts.currentSpecVersion}". A field type not in this list does not exist, whatever ` +
      `other form builders call it — an email field is type "text" with format "email".`,
    data: facts,
  }
}

/**
 * Check a document without publishing it — the server's publish checks, in the
 * gate's order. Only the analysis of regular-expression `pattern`s stays on
 * the server: it needs an analysis engine this package does not carry, and the
 * server's refusal names the pattern.
 *
 * Schema validity, the engine's compile and expression sanity are different
 * failures with different fixes, and a later check means nothing in a document
 * an earlier one has rejected. So the structure is checked first, then whether
 * the engine would open the document at all, then whether its expressions
 * would ever do anything.
 *
 * The middle check was once missing, and this tool told a model that a form
 * with a misspelled field name was valid: the validator does not read CEL and
 * the expression check skips what the engine refuses, so nothing here asked
 * the engine. The server did, and refused it.
 */
export function validateForm(document: unknown): ToolResult {
  const result = validateSchema(document)
  if (!result.valid) {
    return {
      ok: false,
      summary: `Not a valid formancy document: ${String(result.errors.length)} problem(s). Fix these before publishing.`,
      data: { valid: false, errors: result.errors },
    }
  }

  const refusal = engineRefusal(document as FormSchema)
  if (refusal !== undefined) {
    return {
      ok: false,
      summary:
        `The document is structurally valid, but the engine refuses to open it — the same engine the ` +
        `server's publish gate and every renderer build, so this form could be neither published nor shown. ` +
        refusal,
      data: { valid: true, engineRefusal: refusal },
    }
  }

  const problems = expressionProblems(document as FormSchema)
  if (problems.length > 0) {
    return {
      ok: false,
      summary:
        `The document is structurally valid, but ${String(problems.length)} expression(s) will never ` +
        `do anything. These compile and then fail at evaluation, so nothing would report them at runtime: ` +
        `a computed field would stay empty and a visible rule would show the field it was meant to hide.`,
      data: { valid: true, expressionProblems: problems },
    }
  }

  return {
    ok: true,
    summary: 'Valid, and every expression type-checks.',
    data: { valid: true },
  }
}

/**
 * What a change does to the submissions already collected.
 *
 * The question an agent cannot answer by reading the two documents, and the
 * one whose wrong answer is permanent. `breaking` is not advice.
 */
export function diffForms(before: unknown, after: unknown): ToolResult {
  const first = validateSchema(before)
  const second = validateSchema(after)
  if (!first.valid || !second.valid) {
    return {
      ok: false,
      summary: 'Both documents have to be valid before they can be compared. Run validate_form on each.',
      data: { beforeValid: first.valid, afterValid: second.valid },
    }
  }

  const changes = diffSchemas(before as FormSchema, after as FormSchema)
  const worst = severityOf(changes)

  return {
    ok: true,
    summary:
      changes.length === 0
        ? 'No change: the two documents are identical once canonicalised.'
        : `${String(changes.length)} change(s), worst severity ${worst}. ` + ADVICE[worst],
    data: { severity: worst, changes },
  }
}

const ADVICE: Readonly<Record<'none' | 'compatible' | 'lossy' | 'breaking', string>> = {
  none: '',
  compatible: 'Existing drafts and submissions rebind silently.',
  lossy: 'Existing data rebinds, but some answers no longer have a field to live in. They are kept under data.__orphaned rather than deleted.',
  breaking:
    'Existing drafts CANNOT rebind and will open read-only against the version that produced them. Say so before publishing, and consider a new form instead.',
}

function severityOf(changes: readonly Change[]): 'none' | 'compatible' | 'lossy' | 'breaking' {
  if (changes.some((change) => change.severity === 'breaking')) return 'breaking'
  if (changes.some((change) => change.severity === 'lossy')) return 'lossy'
  if (changes.length > 0) return 'compatible'
  return 'none'
}

// --------------------------------------------------------------- server tools

/**
 * Publish, but check first.
 *
 * The local validation is not an optimisation. A model that gets a 422 back
 * has to guess what the server meant from an error shape it has never seen;
 * a model that gets `expressionProblems` back is told which rule, in which
 * words, and what to write instead. And an invalid document never travels.
 */
export async function publishForm(
  access: ServerAccess,
  path: string,
  document: unknown,
  /**
   * The schema hash the edit was based on, from `propose_form_edit` or
   * `get_form`. Given, the published form is checked against it first.
   *
   * Opt-in, and the reason is the first publish: a new form has nothing to be
   * based on, and requiring this would turn it into a fetch of something that
   * is not there. So the unsafe path still exists, which is why the tool's
   * description points at the safe one rather than leaving an agent to guess.
   */
  basedOn?: string,
): Promise<ToolResult> {
  const checked = validateForm(document)
  if (!checked.ok) {
    return {
      ok: false,
      summary: `Not published, because the document would not have worked. ${checked.summary}`,
      data: checked.data,
    }
  }

  if (basedOn !== undefined) {
    const current = await currentSchema(access, path)
    if (!current.ok) return current.problem
    if (current.hash !== basedOn) {
      /*
       * The lost update, and the one mistake here nobody sees until the form
       * is wrong. A document is the WHOLE form, so publishing an edit based
       * on an older version over a newer one discards that version's change
       * entirely — and the publish succeeds, so nothing reports it.
       */
      return {
        ok: false,
        summary:
          `Not published: "${path}" has changed since this edit was based on it, and publishing ` +
          `the whole document would discard that change. Call get_form again, redo the edit ` +
          `against what is there now, and publish with the new basedOn.`,
        data: { basedOn, current: current.hash },
      }
    }
  }

  return request(access, '/forms', {
    method: 'POST',
    body: JSON.stringify({ path, schema: document }),
  })
}

/**
 * A form run against examples with their answers written down.
 *
 * The check nothing else here can make. `validate_form` says a document
 * works; it cannot say the condition is backwards, because
 * `kind == 'other'` and `kind != 'other'` are both valid CEL and the
 * difference is between the document and what somebody meant
 * ([0110](../../../docs/decisions/0110-a-form-is-checked-against-examples.md)).
 *
 * An agent is exactly who needs telling: it writes a rule from a sentence,
 * and an example is the one thing that catches it writing the opposite rule.
 * Local — no server, no credentials — so it can run before anything is
 * published.
 */
export function checkScenarios(document: unknown, scenarios: readonly Scenario[]): ToolResult {
  if (scenarios.length === 0) {
    /*
     * The vacuous pass. "All 0 scenarios hold" is true, and it is the single
     * most misleading sentence this tool could give an agent about to
     * publish.
     */
    return {
      ok: false,
      summary:
        'No scenarios to check, so this says nothing about the form. A scenario is a set of ' +
        'answers and what the form should make of them — whether it validates, which errors ' +
        'it gives, which fields are visible, and what the submission carries.',
    }
  }

  const checked = validateForm(document)
  if (!checked.ok) {
    // One fact, not one failure per example: an agent given twenty identical
    // "no such field" lines reads the noise and not the cause.
    return {
      ok: false,
      summary: `Nothing was checked, because the document would not have worked. ${checked.summary}`,
      data: checked.data,
    }
  }

  const results = runScenarios(document as FormSchema, scenarios)
  const broken = results.filter((result) => !result.passed)

  return {
    ok: broken.length === 0,
    summary:
      broken.length === 0
        ? `All ${String(results.length)} scenarios hold.`
        : `${String(broken.length)} of ${String(results.length)} scenarios no longer hold: ` +
          `${broken.map((result) => `"${result.name}"`).join(', ')}. Each one below says what it ` +
          `expected and what happened — a rule that compiles can still be the opposite of the ` +
          `rule that was asked for.`,
    data: { results },
  }
}

/**
 * An edit held up against what is published, without publishing it.
 *
 * The MCP half of a builder's review step. `validate_form` says a document
 * works; it does not say that the rewrite dropped an option somebody has
 * already chosen, and an agent reading only its own two documents cannot tell
 * either. This fetches what is live, diffs against it, and hands back the
 * change list and the hash — so the agent can put *that* in front of a person
 * rather than "I updated your form", and then publish with the hash so the
 * edit cannot land on a version it was never written against
 * ([0109](../../../docs/decisions/0109-an-ai-edit-is-reviewed-before-it-lands.md)).
 */
export async function proposeFormEdit(
  access: ServerAccess,
  path: string,
  document: unknown,
): Promise<ToolResult> {
  const checked = validateForm(document)
  if (!checked.ok) {
    // A change list for a document that cannot be published is a list of
    // things that will not happen.
    return {
      ok: false,
      summary: `Nothing to review, because the document would not have worked. ${checked.summary}`,
      data: checked.data,
    }
  }

  const current = await currentSchema(access, path)
  if (!current.ok) return current.problem

  const changes = diffSchemas(current.schema, document as FormSchema)
  const worst = severityOf(changes)

  return {
    ok: true,
    summary:
      changes.length === 0
        ? `No change: "${path}" is already this document. Nothing to publish.`
        : `${String(changes.length)} change(s) to "${path}", worst severity ${worst}. ${ADVICE[worst]} ` +
          `Show these to the person before publishing, then publish with basedOn=${current.hash}.`,
    data: { severity: worst, changes, basedOn: current.hash },
  }
}

/** What the server currently has for a path, and its hash. */
async function currentSchema(
  access: ServerAccess,
  path: string,
): Promise<
  { ok: true; schema: FormSchema; hash: string } | { ok: false; problem: ToolResult }
> {
  const fetched = await getForm(access, path)
  if (!fetched.ok) return { ok: false, problem: fetched }

  const schema = (fetched.data as { schema?: unknown } | undefined)?.schema
  const valid = validateSchema(schema)
  if (!valid.valid) {
    // The published form does not validate against this reader's spec: an
    // older client against a newer document. Said plainly rather than
    // compared anyway, which would report nonsense as a change list.
    return {
      ok: false,
      problem: {
        ok: false,
        summary:
          `The form published at "${path}" is not a document this version of the tools can read, ` +
          `so an edit cannot be compared against it. Upgrade the tools to the server's spec version.`,
      },
    }
  }

  return { ok: true, schema: schema as FormSchema, hash: schemaHash(schema as FormSchema) }
}

export async function listForms(access: ServerAccess): Promise<ToolResult> {
  return request(access, '/forms')
}

export async function getForm(access: ServerAccess, path: string): Promise<ToolResult> {
  return request(access, `/f/${encodeURIComponent(path)}`)
}

export async function listSubmissions(access: ServerAccess, path: string): Promise<ToolResult> {
  return request(access, `/f/${encodeURIComponent(path)}/submissions`)
}

/**
 * One request, and one place that knows how a failure is reported.
 *
 * Every error comes back as `ok: false` with the server's own words rather
 * than as a thrown exception, because a thrown exception reaches a model as a
 * stack trace and tells it nothing it can act on.
 */
async function request(
  access: ServerAccess,
  route: string,
  init: RequestInit = {},
): Promise<ToolResult> {
  const send = access.fetch ?? globalThis.fetch
  const url = `${access.baseUrl.replace(/\/$/, '')}${route}`

  let response: Response
  try {
    response = await send(url, {
      ...init,
      headers: {
        ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
        authorization: `Bearer ${access.apiKey}`,
        ...init.headers,
      },
    })
  } catch (error) {
    return {
      ok: false,
      summary:
        `Could not reach the formancy server at ${access.baseUrl}: ${error instanceof Error ? error.message : String(error)}. ` +
        `Check FORMANCY_URL, and that the server is running.`,
    }
  }

  const body: unknown = await response.json().catch(() => undefined)

  if (!response.ok) {
    const detail = messageFrom(body)
    return {
      ok: false,
      summary:
        response.status === 401 || response.status === 403
          ? `The server refused the request (${String(response.status)}). Check FORMANCY_API_KEY.`
          : `The server refused the request (${String(response.status)})${detail === undefined ? '.' : `: ${detail}`}`,
      ...(body === undefined ? {} : { data: body }),
    }
  }

  return { ok: true, summary: 'Done.', data: body }
}

function messageFrom(body: unknown): string | undefined {
  if (body === null || typeof body !== 'object') return undefined
  const record = body as { message?: unknown; error?: unknown }
  if (typeof record.message === 'string') return record.message
  if (typeof record.error === 'string') return record.error
  return undefined
}
