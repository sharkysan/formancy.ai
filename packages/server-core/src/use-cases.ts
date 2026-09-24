import { diffSchemas, schemaHash } from '@formancy/spec'
import type { Change, FormSchema } from '@formancy/spec'
import { validateSchema } from '@formancy/spec/validate'
import type { SchemaError } from '@formancy/spec/validate'
import { createFormEngine, expressionProblems } from '@formancy/core'
import type { CapabilitySource } from '@formancy/core'
import type { FormRecord, Storage } from './ports.js'
import { unsafePatterns } from './redos.js'
import type { UnsafePattern } from './redos.js'

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
  | { ok: false; kind: 'unsafe_pattern'; patterns: UnsafePattern[] }

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

  // Expressions that compile and then fail for every value anybody enters.
  // The engine cannot refuse these — it declares leaves as `dyn` so that a
  // half-typed answer is not a type error, which also makes `seats * 4` look
  // fine until it runs. Refused here rather than at render, so a form already
  // published with the mistake keeps opening for whoever is filling it in.
  const problems = expressionProblems(schema)
  if (problems.length > 0) {
    return { ok: false, kind: 'invalid_logic', message: problems[0]!.message }
  }

  // Before the schema is persisted, because after it is there is no way to
  // time out a regular expression that has already started matching.
  const unsafe = await unsafePatterns(schema)
  if (unsafe.length > 0) {
    return {
      ok: false,
      kind: 'unsafe_pattern',
      patterns: unsafe,
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
  await deps.storage.createForm({
    id: formId,
    path: input.path,
    currentVersionId: null,
    // A newly published form is private. Opening it is a separate, deliberate
    // act through setFormAccess.
    accessSubmit: 'authenticated',
    allowedOrigins: null,
  })
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
  /** The caller may not submit this form: not public, or not from this origin. */
  | { ok: false; kind: 'forbidden' }

/**
 * Accept one submission: resolve the version the client says it rendered,
 * replay the engine over the submitted data, and store the CANONICAL result.
 *
 * The replay is the whole point. Computed values are recomputed and overwrite
 * whatever arrived; visibility is evaluated server-side and hidden branches
 * are stripped, so a client cannot smuggle data by lying about what was shown.
 * Client validation is UX; this is truth.
 */
/**
 * Change who may submit a form, and from where.
 *
 * Separate from publishing on purpose: access is a property of the deployment,
 * and changing it must not mint a new immutable form version or invalidate the
 * schema hash every client is holding.
 */
export async function setFormAccess(
  deps: ServerDeps,
  input: { path: string; submit: 'authenticated' | 'public'; allowedOrigins?: string[] },
): Promise<{ ok: boolean }> {
  const form = await deps.storage.getFormByPath(input.path)
  if (form === undefined) return { ok: false }

  await deps.storage.updateFormAccess(form.id, {
    accessSubmit: input.submit,
    allowedOrigins: input.allowedOrigins ?? null,
  })
  return { ok: true }
}

/**
 * Whether this caller may submit this form at all, before any of the work.
 *
 * Every branch that is not an explicit permission returns false. An allowlist
 * that exists but does not name the origin refuses; an origin header that is
 * absent refuses, because absent is not the same as allowed; an empty
 * allowlist refuses everything, because a list of no origins is a list.
 */
function maySubmit(
  form: FormRecord,
  actor: 'anonymous' | 'authenticated',
  origin: string | undefined,
): boolean {
  if (actor === 'authenticated') return true
  if (form.accessSubmit !== 'public') return false

  const allowed = form.allowedOrigins
  if (allowed === null) return true
  if (origin === undefined) return false

  // Exact match, never a prefix or suffix one: `https://evil-example.ch` ends
  // with the same characters as `example.ch` and must not pass, and
  // `https://example.ch:8443` is a different origin from `https://example.ch`.
  return allowed.includes(origin)
}

export async function createSubmission(
  deps: ServerDeps,
  input: {
    path: string
    declaredSchemaHash: string
    data: unknown
    /** Defaults to anonymous: the caller must prove otherwise, not the reverse. */
    actor?: 'anonymous' | 'authenticated'
    origin?: string
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
  })
  const outcome = engine.submit()
  if (!outcome.ok) return { ok: false, kind: 'invalid', errors: outcome.errors }

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

  await deps.storage.insertSubmission({
    id,
    formId: current.formId,
    formVersionId: current.versionId,
    data: engine.value(),
    submittedAt: deps.nowIso(),
  }, queued)
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
  if (typeof current === 'string' && FORMULA_STARTERS.has(current.charAt(0))) {
    // Spreadsheets execute a cell that starts like a formula. A submission is
    // attacker-controlled and this file is opened by exactly the person worth
    // attacking, so neutralise with the apostrophe convention. Only strings:
    // a number cannot smuggle a formula, and a quoted -5 would break every
    // numeric column.
    return "'" + current
  }
  return String(current)
}

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

/** Save (or re-save) a partial form, bound to the CURRENT version. Undefined
 *  for an unknown form. */
export async function saveDraft(
  deps: ServerDeps,
  input: { path: string; draftId: string; data: unknown },
): Promise<{ version: number } | undefined> {
  const current = await resolveForm(deps, input.path)
  if (current === undefined) return undefined

  await deps.storage.upsertDraft({
    id: input.draftId,
    formId: current.formId,
    formVersionId: current.versionId,
    data: input.data,
    updatedAt: deps.nowIso(),
  })
  return { version: current.version }
}

export interface DraftMigration {
  severity: 'lossy'
  changes: Change[]
}

export type ResumeOutcome =
  | {
      outcome: 'resumed'
      version: number
      schema: FormSchema
      schemaHash: string
      data: unknown
      /** Present when the rebind lost something; absent for a silent rebind. */
      migration?: DraftMigration
    }
  | {
      /** The schema changed in a way no automatic rebind survives: the draft
       *  comes back against ITS OWN version, and the caller offers a restart. */
      outcome: 'readOnly'
      version: number
      schema: FormSchema
      data: unknown
    }

/**
 * Resume a draft — and migrate it LAZILY if the form was republished since,
 * which is versioning rule five: never migrate eagerly on publish, because
 * most drafts are abandoned and eager migration multiplies every publish by
 * every draft.
 *
 * diffSchemas drives the decision: `compatible` rebinds silently, `lossy`
 * rebinds with a report — declared renames carry their value to the new key,
 * removed fields move their value into `__orphaned` rather than deleting it —
 * and `breaking` refuses to rebind at all. A successful rebind is persisted,
 * so the migration runs once, not on every resume.
 */
export async function resumeDraft(
  deps: ServerDeps,
  input: { path: string; draftId: string },
): Promise<ResumeOutcome | undefined> {
  const current = await resolveForm(deps, input.path)
  if (current === undefined) return undefined

  const draft = await deps.storage.getDraft(current.formId, input.draftId)
  if (draft === undefined) return undefined

  if (draft.formVersionId === current.versionId) {
    return {
      outcome: 'resumed',
      version: current.version,
      schema: current.schema,
      schemaHash: current.schemaHash,
      data: draft.data,
    }
  }

  const draftVersion = await deps.storage.getVersionById(draft.formVersionId)
  if (draftVersion === undefined) return undefined

  const changes = diffSchemas(draftVersion.schema, current.schema)
  const severity = changes.reduce<'compatible' | 'lossy' | 'breaking'>(
    (worst, change) =>
      SEVERITY_RANK[change.severity] > SEVERITY_RANK[worst] ? change.severity : worst,
    'compatible',
  )

  if (severity === 'breaking') {
    return {
      outcome: 'readOnly',
      version: draftVersion.version,
      schema: draftVersion.schema,
      data: draft.data,
    }
  }

  const migrated = migrateDraftData(draft.data, current.schema, changes)

  await deps.storage.upsertDraft({
    id: draft.id,
    formId: draft.formId,
    formVersionId: current.versionId,
    data: migrated,
    updatedAt: deps.nowIso(),
  })

  return {
    outcome: 'resumed',
    version: current.version,
    schema: current.schema,
    schemaHash: current.schemaHash,
    data: migrated,
    ...(severity === 'lossy' ? { migration: { severity, changes } } : {}),
  }
}

const SEVERITY_RANK = { compatible: 0, lossy: 1, breaking: 2 } as const

const FORMULA_STARTERS = new Set(['=', '+', '-', '@', String.fromCharCode(9), String.fromCharCode(13)])

function migrateDraftData(data: unknown, currentSchema: FormSchema, changes: Change[]): unknown {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return data
  const migrated: Record<string, unknown> = structuredCloneJson(data as Record<string, unknown>)

  // Declared renames first: the value follows the field to its new key.
  applyRenames(currentSchema.model.fields, migrated)

  // Then removals: the value moves aside instead of vanishing. Only top-level
  // and group paths move; row members stay inside their (possibly orphaned)
  // repeater value, which travels as a whole.
  const orphaned: Record<string, unknown> = {}
  for (const change of changes) {
    if (change.kind !== 'field.removed') continue
    const dataPath = change.path.replace(/^model\.fields\./, '')
    if (dataPath.includes('[]')) continue
    const value = takeAtDottedPath(migrated, dataPath)
    if (value !== undefined) orphaned[dataPath] = value
  }
  if (Object.keys(orphaned).length > 0) {
    migrated['__orphaned'] = {
      ...(migrated['__orphaned'] as Record<string, unknown> | undefined),
      ...orphaned,
    }
  }
  return migrated
}

function applyRenames(fields: FormSchema['model']['fields'], data: Record<string, unknown>): void {
  for (const field of fields) {
    if (field.type === 'page') {
      applyRenames(field.fields ?? [], data)
      continue
    }
    if (field.renamedFrom !== undefined && !(field.key in data) && field.renamedFrom in data) {
      data[field.key] = data[field.renamedFrom]
      delete data[field.renamedFrom]
    }
    if (field.type === 'group' && typeof data[field.key] === 'object' && data[field.key] !== null) {
      applyRenames(field.fields ?? [], data[field.key] as Record<string, unknown>)
    }
  }
}

/** Remove and return the value at a dotted path, pruning nothing else. */
function takeAtDottedPath(data: Record<string, unknown>, dottedPath: string): unknown {
  const segments = dottedPath.split('.')
  let parent: Record<string, unknown> = data
  for (const segment of segments.slice(0, -1)) {
    const next = parent[segment]
    if (next === null || typeof next !== 'object' || Array.isArray(next)) return undefined
    parent = next as Record<string, unknown>
  }
  const last = segments[segments.length - 1]!
  const value = parent[last]
  delete parent[last]
  return value
}

/** JSON-safe deep clone: draft data is JSON by construction, and this package
 *  runs without structuredClone in its lib on purpose. */
function structuredCloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export interface ListedForm {
  path: string
  title: string
  version: number
  schemaHash: string
}

/** Every form with its current version — the admin's landing view. */
export async function listForms(deps: ServerDeps): Promise<ListedForm[]> {
  const forms = await deps.storage.listForms()
  const listed: ListedForm[] = []
  for (const form of forms) {
    if (form.currentVersionId === null) continue
    const current = await deps.storage.getVersionById(form.currentVersionId)
    if (current === undefined) continue
    listed.push({
      path: form.path,
      title: current.schema.title,
      version: current.version,
      schemaHash: current.schemaHash,
    })
  }
  return listed
}

export interface ListedVersion {
  version: number
  schemaHash: string
  title: string
}

/** A form's version history, newest first — metadata only, because a history
 *  view rendering fifty full schemas would be its own denial of service. */
export async function listVersions(
  deps: ServerDeps,
  path: string,
): Promise<ListedVersion[] | undefined> {
  const form = await deps.storage.getFormByPath(path)
  if (form === undefined) return undefined
  const versions = await deps.storage.listVersionsByForm(form.id)
  return versions.map((version) => ({
    version: version.version,
    schemaHash: version.schemaHash,
    title: version.schema.title,
  }))
}
