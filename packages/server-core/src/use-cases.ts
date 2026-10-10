import { diffSchemas } from '@formancy/spec'
import type { Change, FormSchema } from '@formancy/spec'
import { sameToken, signed } from './signing.js'
import type { ServerDeps } from './deps.js'

/**
 * The backend's use-cases, framework-free.
 *
 * Identity and time are injected like every other capability: the server pins
 * one clock per request, so a submission can be replayed later and produce the
 * same computed values byte for byte. Nothing here reads Date.now or crypto.
 */

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

/**
 * The token that proves the bearer started this draft.
 *
 * HMAC over the form and the draft id, the same stateless shape the
 * proof-of-work challenge uses
 * ([0059](../../../docs/decisions/0059-proof-of-work-not-a-captcha.md)): no
 * second table, and no lookup before the check. Bound to the FORM as well as the
 * id so a token cannot be carried to a draft of another form that happens to
 * share an id.
 */
function draftToken(secret: string, formId: string, draftId: string): string {
  return signed(secret, `${formId}:${draftId}`)
}

/**
 * Start a draft: the server picks the id, and signs it.
 *
 * The id is the server's because an id a caller supplies is an id a caller can
 * enumerate — and enumerating them was enough to read other people's
 * part-filled answers.
 */
export async function startDraft(
  deps: ServerDeps,
  input: { path: string },
): Promise<{ draftId: string; token: string } | undefined> {
  const current = await resolveForm(deps, input.path)
  if (current === undefined) return undefined

  const draftId = deps.newId()
  return { draftId, token: draftToken(deps.draftSecret, current.formId, draftId) }
}

/** Save (or re-save) a partial form, bound to the CURRENT version. Undefined
 *  for an unknown form. */
export async function saveDraft(
  deps: ServerDeps,
  input: { path: string; draftId: string; token: string; data: unknown },
): Promise<{ version: number; saved: boolean } | undefined> {
  const current = await resolveForm(deps, input.path)
  if (current === undefined) return undefined

  // Refused before the write, not after it. Overwriting is the worse half of
  // this: the person whose draft it is then submits the substituted content
  // under their own name, and nothing anywhere says otherwise.
  if (!sameToken(input.token, draftToken(deps.draftSecret, current.formId, input.draftId))) {
    return { version: current.version, saved: false }
  }

  await deps.storage.upsertDraft({
    id: input.draftId,
    formId: current.formId,
    formVersionId: current.versionId,
    data: input.data,
    updatedAt: deps.nowIso(),
  })
  return { version: current.version, saved: true }
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
  input: { path: string; draftId: string; token: string },
): Promise<ResumeOutcome | undefined> {
  const current = await resolveForm(deps, input.path)
  if (current === undefined) return undefined

  // Checked before the lookup, and answered identically to a draft that is not
  // there: replying differently would confirm which ids exist.
  if (!sameToken(input.token, draftToken(deps.draftSecret, current.formId, input.draftId))) {
    return undefined
  }

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
