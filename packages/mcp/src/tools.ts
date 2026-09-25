import {
  CONTAINER_FIELD_TYPES,
  CURRENT_SPEC_VERSION,
  FIELD_TYPES,
  LIST_VALUED_FIELD_TYPES,
  SPEC_1_FIELD_TYPES,
  SPEC_1_LAYOUT_KINDS,
  SPEC_VERSIONS,
  diffSchemas,
} from '@formancy/spec'
import { validateSchema } from '@formancy/spec/validate'
import type { Change, FormSchema } from '@formancy/spec'
import { expressionProblems } from '@formancy/core'

/**
 * What formancy can be asked to do by a coding agent, as plain functions.
 *
 * Separated from the MCP server itself for the same reason `server-core` is
 * separated from `server`: the protocol is a transport, and a use-case that
 * can only be exercised through one is a use-case nobody can test. Everything
 * here is a function from JSON to JSON.
 *
 * ── WHAT MAKES THIS WORTH HAVING ─────────────────────────────────────────────
 *
 * A model writing a form is a model writing logic, and logic is where a model
 * is least reliable and least correctable: a wrong expression does not crash,
 * it quietly shows the wrong field to the wrong person for a year. Wrapping a
 * REST API in tool definitions does nothing about that.
 *
 * formancy can do something about it, because of decisions taken long before
 * anybody thought about agents. The document format has a published JSON
 * Schema, so a generated document is checkable. Expressions are CEL and are
 * statically type-checked, so `seats * 4` against a double is an error with a
 * message rather than a field that stays empty. `diffSchemas` grades a change
 * against the submissions already collected. And CEL is non-Turing-complete by
 * construction, so a model-written expression cannot loop, cannot reach the
 * network and cannot be code.
 *
 * So the tools below check first and act second. `publish_form` validates
 * locally before it opens a socket: an invalid document never reaches the
 * server, and the model gets the reason rather than a 422.
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
  return {
    ok: true,
    summary:
      `formancy speaks spec versions ${SPEC_VERSIONS.join(' and ')}; new documents should use ` +
      `"${CURRENT_SPEC_VERSION}". A field type not in this list does not exist, whatever other ` +
      `form builders call it — an email field is type "text" with format "email".`,
    data: {
      specVersions: SPEC_VERSIONS,
      currentSpecVersion: CURRENT_SPEC_VERSION,
      fieldTypes: FIELD_TYPES,
      fieldTypesInSpec1: SPEC_1_FIELD_TYPES,
      containerFieldTypes: CONTAINER_FIELD_TYPES,
      listValuedFieldTypes: LIST_VALUED_FIELD_TYPES,
      layoutKinds: [...SPEC_1_LAYOUT_KINDS, 'tabs', 'table'],
      ruleKinds: ['visible', 'disabled', 'required', 'computed', 'validate'],
      formats: ['email', 'url', 'uuid'],
      notes: [
        'A version 1 document may not contain a version 2 construct. selectboxes, file, richtext, tabs and table all need version 2.',
        'An empty answer for a list-valued field is [], never null. A rule reads it as a list.',
        'Expressions are CEL and are type-checked. A JSON number is a double, so write 4.0 rather than 4 when multiplying one.',
        'Field keys are identity. Renaming one is a migration, declared with renamedFrom, not an edit.',
      ],
    },
  }
}

/**
 * Check a document without publishing it, and check the two things separately.
 *
 * Schema validity and expression sanity are different failures with different
 * fixes, and an expression that type-checks in a document the validator has
 * already rejected means nothing. So the structure is checked first and the
 * logic only if it passed.
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
): Promise<ToolResult> {
  const checked = validateForm(document)
  if (!checked.ok) {
    return {
      ok: false,
      summary: `Not published, because the document would not have worked. ${checked.summary}`,
      data: checked.data,
    }
  }

  return request(access, '/forms', {
    method: 'POST',
    body: JSON.stringify({ path, schema: document }),
  })
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
