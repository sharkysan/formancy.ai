import { schemaHash } from '@formancy/spec'
import type { FormSchema } from '@formancy/spec'
import { validateSchema } from '@formancy/spec/validate'
import type { SchemaError } from '@formancy/spec/validate'
import { createFormEngine } from '@formancy/core'
import type { CapabilitySource } from '@formancy/core'
import type { Storage } from './ports.js'

/**
 * The backend's use-cases, framework-free.
 *
 * Identity and time are injected like every other capability: the server pins
 * one clock per request, so a submission can be replayed later and produce the
 * same computed values byte for byte. Nothing here reads Date.now or crypto.
 */
export interface ServerDeps {
  storage: Storage
  newId(): string
  nowIso(): string
  /** The clock/randomness the ENGINE sees during replay. */
  capabilities: CapabilitySource
}

export type PublishOutcome =
  | { ok: true; formId: string; versionId: string; version: number; schemaHash: string }
  | { ok: false; kind: 'invalid_schema'; errors?: SchemaError[] }
  | { ok: false; kind: 'invalid_logic'; message: string }

/**
 * Publish a schema as a form's next version.
 *
 * This is the save gate: structural validation, then the ENGINE's own compile
 * — type-checked expressions, kind policies and the cycle graph — so a form
 * that can loop or read a ghost field is refused here and never persisted.
 * Republishing the identical document is idempotent, because "deploy again"
 * must never manufacture a version.
 */
export async function publishForm(
  deps: ServerDeps,
  input: { path: string; schema: unknown },
): Promise<PublishOutcome> {
  const validated = validateSchema(input.schema)
  if (!validated.valid) return { ok: false, kind: 'invalid_schema', errors: validated.errors }
  const schema: FormSchema = validated.schema

  try {
    createFormEngine({ schema, capabilities: deps.capabilities })
  } catch (error) {
    return {
      ok: false,
      kind: 'invalid_logic',
      message: error instanceof Error ? error.message : String(error),
    }
  }

  const hash = schemaHash(schema)
  const existing = await deps.storage.getFormByPath(input.path)

  if (existing !== undefined) {
    const current =
      existing.currentVersionId === null
        ? undefined
        : await deps.storage.getVersionById(existing.currentVersionId)
    if (current !== undefined && current.schemaHash === hash) {
      return {
        ok: true,
        formId: existing.id,
        versionId: current.id,
        version: current.version,
        schemaHash: hash,
      }
    }

    const version = (await deps.storage.latestVersionNumber(existing.id)) + 1
    const versionId = deps.newId()
    await deps.storage.insertVersion({
      id: versionId,
      formId: existing.id,
      version,
      schema,
      schemaHash: hash,
    })
    await deps.storage.setCurrentVersion(existing.id, versionId)
    return { ok: true, formId: existing.id, versionId, version, schemaHash: hash }
  }

  const formId = deps.newId()
  const versionId = deps.newId()
  await deps.storage.createForm({ id: formId, path: input.path, currentVersionId: null })
  await deps.storage.insertVersion({ id: versionId, formId, version: 1, schema, schemaHash: hash })
  await deps.storage.setCurrentVersion(formId, versionId)
  return { ok: true, formId, versionId, version: 1, schemaHash: hash }
}

export interface ResolvedForm {
  formId: string
  versionId: string
  version: number
  schema: FormSchema
  schemaHash: string
}

export async function resolveForm(deps: ServerDeps, path: string): Promise<ResolvedForm | undefined> {
  const form = await deps.storage.getFormByPath(path)
  if (form === undefined || form.currentVersionId === null) return undefined
  const current = await deps.storage.getVersionById(form.currentVersionId)
  if (current === undefined) return undefined
  return {
    formId: form.id,
    versionId: current.id,
    version: current.version,
    schema: current.schema,
    schemaHash: current.schemaHash,
  }
}

export type SubmissionOutcome =
  | { ok: true; id: string; canonicalData: unknown }
  | { ok: false; kind: 'unknown_form' }
  | { ok: false; kind: 'version_changed'; current?: ResolvedForm }
  | { ok: false; kind: 'invalid'; errors: Record<string, string[]> }

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
  input: { path: string; declaredSchemaHash: string; data: unknown },
): Promise<SubmissionOutcome> {
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
  })
  const outcome = engine.submit()
  if (!outcome.ok) return { ok: false, kind: 'invalid', errors: outcome.errors }

  const id = deps.newId()
  await deps.storage.insertSubmission({
    id,
    formId: current.formId,
    formVersionId: current.versionId,
    data: engine.value(),
    submittedAt: deps.nowIso(),
  })
  return { ok: true, id, canonicalData: engine.value() }
}

export interface ListedSubmission {
  id: string
  version: number
  submittedAt: string
  data: unknown
}

/** The submissions of one form, newest first, each tagged with the schema
 *  version that produced it. Undefined for an unknown form: the caller must
 *  404, and an empty list would lie about that. */
export async function listSubmissions(
  deps: ServerDeps,
  path: string,
): Promise<ListedSubmission[] | undefined> {
  const form = await deps.storage.getFormByPath(path)
  if (form === undefined) return undefined

  const versions = await deps.storage.listVersionsByForm(form.id)
  const versionNumberById = new Map(versions.map((version) => [version.id, version.version]))

  const records = await deps.storage.listSubmissionsByForm(form.id)
  return records.map((record) => ({
    id: record.id,
    version: versionNumberById.get(record.formVersionId) ?? 0,
    submittedAt: record.submittedAt,
    data: record.data,
  }))
}

/**
 * Every submission of a form as CSV, columns UNIONED across schema versions:
 * the current version's columns lead in its own order, and columns that only
 * exist in older versions follow — data outlives the field that collected it,
 * and an export that silently dropped extinct columns would lose it.
 *
 * A repeater is one column carrying its rows as JSON: rows-per-cell beats
 * exploding one submission across several CSV lines, which breaks every
 * spreadsheet join a business user will try.
 */
export async function exportCsv(deps: ServerDeps, path: string): Promise<string | undefined> {
  const form = await deps.storage.getFormByPath(path)
  if (form === undefined) return undefined

  const versions = await deps.storage.listVersionsByForm(form.id)
  const versionNumberById = new Map(versions.map((version) => [version.id, version.version]))

  const columns: string[] = []
  const seen = new Set<string>()
  for (const version of versions) {
    for (const column of dataColumns(version.schema)) {
      if (!seen.has(column)) {
        seen.add(column)
        columns.push(column)
      }
    }
  }

  const records = await deps.storage.listSubmissionsByForm(form.id)
  const lines = [['id', 'submittedAt', 'version', ...columns].map(csvCell).join(',')]
  for (const record of records) {
    const cells = [
      record.id,
      record.submittedAt,
      String(versionNumberById.get(record.formVersionId) ?? 0),
      ...columns.map((column) => cellValue(record.data, column)),
    ]
    lines.push(cells.map(csvCell).join(','))
  }
  return lines.join('\n') + '\n'
}

/** One column per collected answer: leaves as dotted paths through groups,
 *  a repeater as a single column, pages transparent as always. */
function dataColumns(schema: FormSchema): string[] {
  const columns: string[] = []
  const walk = (fields: readonly FormSchema['model']['fields'][number][], prefix: string): void => {
    for (const field of fields) {
      if (field.type === 'page') walk(field.fields ?? [], prefix)
      else if (field.type === 'group') walk(field.fields ?? [], `${prefix}${field.key}.`)
      else columns.push(`${prefix}${field.key}`)
    }
  }
  walk(schema.model.fields, '')
  return columns
}

function cellValue(data: unknown, column: string): string {
  let current: unknown = data
  for (const segment of column.split('.')) {
    if (current === null || typeof current !== 'object') return ''
    current = (current as Record<string, unknown>)[segment]
  }
  if (current === undefined || current === null) return ''
  if (typeof current === 'object') return JSON.stringify(current)
  return String(current)
}

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}
