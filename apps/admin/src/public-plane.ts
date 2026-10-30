import type { FormSchema } from '@formancy/spec'
import { BASE, authed } from './api.js'

/*
 * The public plane: the routes a respondent's browser calls, which the fill-in pane calls the same
 * way on purpose, since a demonstration that quietly used the management plane would be
 * demonstrating something else. Reading the form and its drafts takes no session; sending it is
 * signed in, as the admin is, which skips the challenge.
 *
 * Apart from `api.ts`, the management plane's client, because these change with what a respondent
 * does and those with what an operator does. They left when `api.ts` had no line for paging.
 */

/**
 * The published form, as a respondent gets it — with the token its response is sent with,
 * a new one each time it is read (0169).
 */
export async function fetchPublicForm(path: string): Promise<{ version: number; schemaHash: string; schema: FormSchema; submissionToken: string }> {
  const response = await fetch(`${BASE}/f/${encodeURIComponent(path)}`)
  if (!response.ok) throw new Error(`This form could not be loaded (${String(response.status)}).`)
  return (await response.json()) as { version: number; schemaHash: string; schema: FormSchema; submissionToken: string }
}

/**
 * Start a draft. The server picks the id and signs it; the key comes once. So does the token
 * the response is then sent with, which names the draft and is what a resume hands back.
 */
export async function startDraft(path: string): Promise<{ id: string; token: string; submissionToken: string } | undefined> {
  const response = await fetch(`${BASE}/f/${encodeURIComponent(path)}/drafts`, { method: 'POST' })
  if (!response.ok) return undefined
  const body = (await response.json()) as { draftId: string; token: string; submissionToken: string }
  return { id: body.draftId, token: body.token, submissionToken: body.submissionToken }
}

export async function saveDraft(path: string, id: string, token: string, data: unknown): Promise<boolean> {
  const response = await fetch(`${BASE}/f/${encodeURIComponent(path)}/drafts/${encodeURIComponent(id)}`, {
    method: 'PUT',
    // In the header, never the URL: a token in a URL lands in logs, in a
    // Referer and in somebody's browser history.
    headers: { 'content-type': 'application/json', 'x-formancy-draft-token': token },
    body: JSON.stringify(data),
  })
  return response.ok
}

export interface ResumedDraft {
  outcome: 'resumed' | 'readOnly'
  version: number
  schema: FormSchema
  schemaHash: string
  data: Record<string, unknown>
  migration?: { severity: 'lossy' | 'breaking'; changes: Array<{ kind: string; path?: string }> }
  /** On `resumed`: the token the response is sent with, the same on every resume. */
  submissionToken?: string
}

/** `undefined` for a draft that is gone OR a token that does not match: the
 *  server answers those identically so a reply cannot enumerate ids. */
export async function resumeDraft(path: string, id: string, token: string): Promise<ResumedDraft | undefined> {
  const response = await fetch(`${BASE}/f/${encodeURIComponent(path)}/drafts/${encodeURIComponent(id)}`, {
    headers: { 'x-formancy-draft-token': token },
  })
  if (!response.ok) return undefined
  return (await response.json()) as ResumedDraft
}

/** The hash is the version the browser actually rendered, and the server
 *  decides what to do about a stale one. The token is the one this response was handed, so
 *  the same response sent twice is stored once (0169) — in a header, never the URL. A refusal
 *  carries the server's `error` code beside its sentence, because one of them,
 *  `submission_token_spent`, means the response IS stored, and the page has to tell that apart
 *  from the ones that mean it is not. */
export async function submitForm(
  path: string,
  schemaHash: string,
  submissionToken: string,
  data: unknown,
): Promise<{ ok: true } | { ok: false; message: string; error?: string }> {
  const response = await authed(`${BASE}/f/${encodeURIComponent(path)}/submissions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-formancy-schema-hash': schemaHash,
      'x-formancy-submission-token': submissionToken,
    },
    body: JSON.stringify(data),
  })
  if (response.ok) return { ok: true }
  const body = (await response.json().catch(() => ({}))) as { message?: string; error?: string }
  return {
    ok: false,
    message: body.message ?? body.error ?? `The server refused it (${String(response.status)}).`,
    ...(body.error === undefined ? {} : { error: body.error }),
  }
}
