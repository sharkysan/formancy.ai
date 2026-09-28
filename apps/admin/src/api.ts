import type { FormSchema } from '@formancy/spec'
import type { SchemaError } from '@formancy/spec/validate'
import type { StoredFile } from '@formancy/react'

/**
 * The admin's view of the server API, through the dev proxy (/api -> :4380).
 * Thin on purpose: the generated OpenAPI client replaces this file once
 * @fastify/swagger lands with the auth work.
 */
export interface FormListEntry {
  path: string
  title: string
  version: number
  schemaHash: string
}

export interface VersionEntry {
  version: number
  schemaHash: string
  title: string
}

export interface SubmissionEntry {
  id: string
  version: number
  submittedAt: string
  data: unknown
}

const BASE = '/api'

/**
 * The session token, kept in sessionStorage.
 *
 * Not localStorage: this dies with the tab, so a shared machine does not leave
 * an admin session behind. Still readable by script on this origin, which is
 * the standing trade-off for a token in a browser — the mitigation is that the
 * admin renders no untrusted HTML, and the real answer is an httpOnly cookie
 * when the server grows one.
 */
const TOKEN_KEY = 'formancy.admin.token'

export function currentToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY)
  } catch {
    // Private mode, or storage disabled. A session that does not persist is
    // better than an admin that will not load.
    return null
  }
}

export function setToken(token: string | null): void {
  try {
    if (token === null) sessionStorage.removeItem(TOKEN_KEY)
    else sessionStorage.setItem(TOKEN_KEY, token)
  } catch {
    /* as above */
  }
}

export class Unauthorized extends Error {
  constructor() {
    super('Not signed in')
    this.name = 'Unauthorized'
  }
}

/** Every management call goes through here, so none can forget the header. */
async function authed(input: string, init?: RequestInit): Promise<Response> {
  const token = currentToken()
  const response = await fetch(input, {
    ...init,
    headers: {
      ...init?.headers,
      ...(token === null ? {} : { authorization: `Bearer ${token}` }),
    },
  })
  if (response.status === 401) {
    setToken(null)
    throw new Unauthorized()
  }
  return response
}

export async function login(email: string, password: string): Promise<boolean> {
  const response = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!response.ok) return false
  setToken((await response.json() as { token: string }).token)
  return true
}

export async function fetchForms(): Promise<FormListEntry[]> {
  const response = await authed(`${BASE}/forms`)
  if (!response.ok) throw new Error(`GET /forms failed: ${response.status}`)
  return ((await response.json()) as { forms: FormListEntry[] }).forms
}

export async function fetchForm(
  path: string,
): Promise<{ version: number; schemaHash: string; schema: FormSchema }> {
  const response = await authed(`${BASE}/f/${encodeURIComponent(path)}`)
  if (!response.ok) throw new Error(`GET /f/${path} failed: ${response.status}`)
  return (await response.json()) as { version: number; schemaHash: string; schema: FormSchema }
}

export type PublishResult =
  | { ok: true; version: number; schemaHash: string }
  | { ok: false; message: string; errors?: SchemaError[] }

export async function publish(path: string, schema: unknown): Promise<PublishResult> {
  const response = await authed(`${BASE}/forms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path, schema }),
  })
  const body = (await response.json()) as Record<string, unknown>
  if (response.ok) {
    return { ok: true, version: body['version'] as number, schemaHash: body['schemaHash'] as string }
  }
  return {
    ok: false,
    message: (body['message'] as string | undefined) ?? (body['error'] as string | undefined) ?? 'publish failed',
    ...(Array.isArray(body['errors']) ? { errors: body['errors'] as SchemaError[] } : {}),
  }
}

export async function fetchVersions(path: string): Promise<VersionEntry[]> {
  const response = await authed(`${BASE}/f/${encodeURIComponent(path)}/versions`)
  if (!response.ok) throw new Error(`versions failed: ${response.status}`)
  return ((await response.json()) as { versions: VersionEntry[] }).versions
}

export async function fetchSubmissions(path: string): Promise<SubmissionEntry[]> {
  const response = await authed(`${BASE}/f/${encodeURIComponent(path)}/submissions`)
  if (!response.ok) throw new Error(`submissions failed: ${response.status}`)
  return ((await response.json()) as { submissions: SubmissionEntry[] }).submissions
}

/**
 * A webhook's health, as the server reports it.
 *
 * No secret and no url beyond the destination: this is shown on a screen, and
 * a signing secret is not a health indicator.
 */
export interface WebhookHealthEntry {
  id: string
  url: string
  state: 'closed' | 'half-open' | 'open'
  consecutiveFailures: number
  failingSince: string | null
}

export interface DeadDeliveryEntry {
  id: string
  webhookId: string
  submissionId: string
  eventId: string
  attempt: number
  lastError: string | null
}

export async function fetchWebhookHealth(): Promise<WebhookHealthEntry[]> {
  const response = await authed(`${BASE}/webhooks`)
  if (!response.ok) throw new Error(`webhooks failed: ${response.status}`)
  return ((await response.json()) as { webhooks: WebhookHealthEntry[] }).webhooks
}

export async function fetchDeadDeliveries(): Promise<DeadDeliveryEntry[]> {
  const response = await authed(`${BASE}/deliveries/dead`)
  if (!response.ok) throw new Error(`dead deliveries failed: ${response.status}`)
  return ((await response.json()) as { deliveries: DeadDeliveryEntry[] }).deliveries
}

/**
 * Send a dead delivery again.
 *
 * The refusal is a real answer rather than an error: a 409 means somebody
 * already replayed it, or it went through on its own — and both are worth
 * telling the operator plainly instead of showing a stack trace.
 */
export async function replayDelivery(id: string): Promise<{ ok: boolean; message?: string }> {
  const response = await authed(`${BASE}/deliveries/${encodeURIComponent(id)}/replay`, {
    method: 'POST',
  })
  if (response.ok) return { ok: true }

  const body = (await response.json().catch(() => ({}))) as { message?: string; error?: string }
  return {
    ok: false,
    message:
      body.message ??
      body.error ??
      `The server refused the replay (${String(response.status)}).`,
  }
}

export function exportUrl(path: string): string {
  return `${BASE}/f/${encodeURIComponent(path)}/submissions/export.csv`
}

/**
 * Uploading a file for a form, in the two steps the server asks for.
 *
 * Offer first, bytes second. The offer is where the size and the type are
 * checked, so a file the form does not accept is refused before a byte is
 * sent rather than after it has arrived.
 *
 * Shaped as the renderers' `Uploader`, so the preview uses the same control a
 * consumer's form does — including the part where a failure is said out loud
 * instead of leaving somebody believing they attached something.
 */
export async function uploadFile(path: string, field: string, file: File): Promise<StoredFile> {
  const offered = await authed(`${BASE}/f/${encodeURIComponent(path)}/files`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      field,
      name: file.name,
      size: file.size,
      contentType: file.type === '' ? 'application/octet-stream' : file.type,
    }),
  })

  if (!offered.ok) {
    const body = (await offered.json().catch(() => ({}))) as { error?: string; message?: string }
    throw new Error(body.message ?? body.error ?? `The server refused the upload (${String(offered.status)}).`)
  }

  const stored = (await offered.json()) as StoredFile & { uploadUrl: string }

  const put = await authed(`${BASE}${stored.uploadUrl}`, {
    method: 'PUT',
    headers: { 'content-type': stored.contentType },
    body: file,
  })
  if (!put.ok) throw new Error(`The upload failed (${String(put.status)}).`)

  // Without uploadUrl: it is how to send the bytes, not part of the answer,
  // and storing it would put a route into somebody's submission data.
  const { uploadUrl: _sent, ...answer } = stored
  return answer
}

// --------------------------------------------------------------- the public plane
//
// These four take no session. They are the routes a respondent's browser calls,
// and the admin calls them the same way on purpose: a demonstration that quietly
// used the management plane would be demonstrating something else.

/** The published form, as a respondent gets it. */
export async function fetchPublicForm(
  path: string,
): Promise<{ version: number; schemaHash: string; schema: FormSchema }> {
  const response = await fetch(`${BASE}/f/${encodeURIComponent(path)}`)
  if (!response.ok) throw new Error(`This form could not be loaded (${String(response.status)}).`)
  return (await response.json()) as { version: number; schemaHash: string; schema: FormSchema }
}

/** Start a draft. The server picks the id and signs it; the token comes once. */
export async function startDraft(path: string): Promise<{ id: string; token: string } | undefined> {
  const response = await fetch(`${BASE}/f/${encodeURIComponent(path)}/drafts`, { method: 'POST' })
  if (!response.ok) return undefined
  const body = (await response.json()) as { draftId: string; token: string }
  return { id: body.draftId, token: body.token }
}

export async function saveDraft(
  path: string,
  id: string,
  token: string,
  data: unknown,
): Promise<boolean> {
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
}

/** `undefined` for a draft that is gone OR a token that does not match: the
 *  server answers those identically so a reply cannot enumerate ids. */
export async function resumeDraft(
  path: string,
  id: string,
  token: string,
): Promise<ResumedDraft | undefined> {
  const response = await fetch(`${BASE}/f/${encodeURIComponent(path)}/drafts/${encodeURIComponent(id)}`, {
    headers: { 'x-formancy-draft-token': token },
  })
  if (!response.ok) return undefined
  return (await response.json()) as ResumedDraft
}

/** The hash is the version the browser actually rendered, and the server
 *  decides what to do about a stale one. */
export async function submitForm(
  path: string,
  schemaHash: string,
  data: unknown,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const response = await authed(`${BASE}/f/${encodeURIComponent(path)}/submissions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-formancy-schema-hash': schemaHash },
    body: JSON.stringify(data),
  })
  if (response.ok) return { ok: true }
  const body = (await response.json().catch(() => ({}))) as { message?: string; error?: string }
  return { ok: false, message: body.message ?? body.error ?? `The server refused it (${String(response.status)}).` }
}
