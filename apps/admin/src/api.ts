import type { FormSchema } from '@formancy/spec'
import type { SchemaError } from '@formancy/spec/validate'

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

export async function fetchForms(): Promise<FormListEntry[]> {
  const response = await fetch(`${BASE}/forms`)
  if (!response.ok) throw new Error(`GET /forms failed: ${response.status}`)
  return ((await response.json()) as { forms: FormListEntry[] }).forms
}

export async function fetchForm(
  path: string,
): Promise<{ version: number; schemaHash: string; schema: FormSchema }> {
  const response = await fetch(`${BASE}/f/${encodeURIComponent(path)}`)
  if (!response.ok) throw new Error(`GET /f/${path} failed: ${response.status}`)
  return (await response.json()) as { version: number; schemaHash: string; schema: FormSchema }
}

export type PublishResult =
  | { ok: true; version: number; schemaHash: string }
  | { ok: false; message: string; errors?: SchemaError[] }

export async function publish(path: string, schema: unknown): Promise<PublishResult> {
  const response = await fetch(`${BASE}/forms`, {
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
  const response = await fetch(`${BASE}/f/${encodeURIComponent(path)}/versions`)
  if (!response.ok) throw new Error(`versions failed: ${response.status}`)
  return ((await response.json()) as { versions: VersionEntry[] }).versions
}

export async function fetchSubmissions(path: string): Promise<SubmissionEntry[]> {
  const response = await fetch(`${BASE}/f/${encodeURIComponent(path)}/submissions`)
  if (!response.ok) throw new Error(`submissions failed: ${response.status}`)
  return ((await response.json()) as { submissions: SubmissionEntry[] }).submissions
}

export function exportUrl(path: string): string {
  return `${BASE}/f/${encodeURIComponent(path)}/submissions/export.csv`
}
