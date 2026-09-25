import { modelDataPaths } from '@formancy/spec'
import type { FieldDef, FormSchema } from '@formancy/spec'
import { maySubmit } from './access.js'
import type { FileRecord, FormRecord, Storage } from './ports.js'

/**
 * The file lifecycle: offered, stored, claimed, collected.
 *
 * **Bytes are not the submission's problem.** A submission stores what each
 * file is and where it went, never the bytes themselves, so a submission read
 * back years later is small, self-describing, and still says what was attached
 * even if the object store has since been emptied.
 *
 * **The claim happens inside the submission's transaction.** A submission
 * exists if and only if the files it names are claimed against it. Anything
 * looser gives one of the two failures nobody can debug: a rolled-back
 * submission leaving files claimed against nothing, or an accepted submission
 * referencing files the collector is about to delete.
 *
 * **Nothing here touches a disk.** This package has no filesystem and no
 * object store; it decides what is rubbish and the host deletes it. That is
 * the same split every other port here makes, and it is why the whole
 * lifecycle is testable without either.
 */

export interface OfferDeps {
  storage: Storage
  now: () => Date
  newId: () => string
}

export interface OfferInput {
  schema: FormSchema
  /** The form, for the access check — the same one a submission passes. */
  form: FormRecord
  actor: 'anonymous' | 'authenticated'
  origin: string | undefined
  /** The field the file is for, as a data path: `evidence`, `people[].passport`. */
  field: string
  name: string
  size: number
  contentType: string
}

export type OfferOutcome =
  | { ok: true; file: FileRecord }
  | {
      ok: false
      reason: 'not_allowed' | 'unknown_field' | 'not_a_file_field' | 'too_large' | 'not_accepted'
    }

/**
 * Agree where a file will go, and refuse it before a byte is sent.
 *
 * Checking here rather than after the upload is the difference between
 * refusing a 2 GB file and receiving one first. The browser's own `accept` and
 * size limits are a convenience for the person filling the form in; these are
 * the rule, because somebody posting to the endpoint directly has neither.
 */
export async function offerUpload(deps: OfferDeps, input: OfferInput): Promise<OfferOutcome> {
  // The same gate the submission passes, and the same function — a form
  // nobody may submit to is not a form anybody may upload to either, or the
  // store becomes free disk for whoever finds the path. Two copies of that
  // rule is one copy that gets forgotten.
  if (!maySubmit(input.form, input.actor, input.origin)) return { ok: false, reason: 'not_allowed' }

  const def = fileFieldAt(input.schema, input.field)
  if (def === undefined) return { ok: false, reason: 'unknown_field' }
  if (def.type !== 'file') return { ok: false, reason: 'not_a_file_field' }

  if (def.maxFileSize !== undefined && input.size > def.maxFileSize) {
    return { ok: false, reason: 'too_large' }
  }
  if (!accepted(def.accept, input.name, input.contentType)) {
    return { ok: false, reason: 'not_accepted' }
  }

  const id = deps.newId()
  const file: FileRecord = {
    id,
    formId: input.form.id,
    name: input.name,
    size: input.size,
    contentType: input.contentType,
    // Built from the id and the form, never from the submitted name. The name
    // is display only and may be anything at all, including `../../etc/passwd`.
    storageKey: `${input.form.id}/${id}`,
    state: 'offered',
    createdAt: deps.now().toISOString(),
    submissionId: null,
  }

  await deps.storage.insertFile(file)
  return { ok: true, file }
}

export type ClaimOutcome =
  | { ok: true; ids: readonly string[] }
  | { ok: false; unknown: readonly string[] }

/**
 * Which files a submission may claim, checked but not yet claimed.
 *
 * The claiming itself is `insertSubmission`'s job, in the same call that
 * stores the submission, so one COMMIT decides both — the same reasoning
 * that put the webhook queue there. A submission exists if and only if the
 * files it names belong to it. Claiming separately gives the two failures
 * nobody can debug: a rolled-back submission leaving files claimed against
 * nothing, or an accepted submission referencing bytes the collector is about
 * to delete.
 *
 * Refuses rather than skips. A submission naming a file that does not exist,
 * belongs to another form, or is already claimed is not a submission to fix up
 * quietly: the first is a bug or somebody guessing ids; the second is how an
 * id from a form you may submit to would let you attach a file from one you
 * may not; the third would make deleting a submission either leak bytes or
 * break a different one.
 */
export async function filesToClaim(
  storage: Storage,
  input: { schema: FormSchema; formId: string; data: unknown },
): Promise<ClaimOutcome> {
  const ids = referencedFileIds(input.schema, input.data)
  if (ids.length === 0) return { ok: true, ids: [] }

  const unknown: string[] = []
  const claimable: FileRecord[] = []

  for (const id of ids) {
    const file = await storage.getFile(id)
    if (file === undefined || file.formId !== input.formId || file.state !== 'stored') {
      unknown.push(id)
      continue
    }
    claimable.push(file)
  }

  if (unknown.length > 0) return { ok: false, unknown }

  return { ok: true, ids: claimable.map((file) => file.id) }
}

/**
 * Files nobody claimed, old enough that nobody is going to.
 *
 * Returns the rows rather than deleting anything: the host removes the bytes
 * and then the rows, in that order, because a row without bytes is a broken
 * reference and bytes without a row are invisible rubbish. Of the two, the
 * second is the one you never find out about.
 */
export async function collectAbandonedFiles(
  storage: Storage,
  now: Date,
  afterHours: number,
): Promise<FileRecord[]> {
  const before = new Date(now.getTime() - afterHours * 3_600_000).toISOString()
  return storage.abandonedFiles(before)
}

// ------------------------------------------------------------------ helpers

/** The field at a data path, with `[]` treated as "inside this repeater". */
function fileFieldAt(schema: FormSchema, path: string): FieldDef | undefined {
  const wanted = path.replace(/\[\]/g, '')
  const segments = wanted.split('.').filter((segment) => segment !== '')

  let fields: readonly FieldDef[] = flattenPages(schema.model.fields)
  let found: FieldDef | undefined

  for (const segment of segments) {
    found = fields.find((field) => field.key === segment)
    if (found === undefined) return undefined
    fields = flattenPages(found.fields ?? [])
  }
  return found
}

/** A page contributes no segment to a data path. */
function flattenPages(fields: readonly FieldDef[]): FieldDef[] {
  const out: FieldDef[] = []
  for (const field of fields) {
    if (field.type === 'page') out.push(...flattenPages(field.fields ?? []))
    else out.push(field)
  }
  return out
}

/** The HTML `accept` grammar, as the engine reads it. */
function accepted(accept: readonly string[] | undefined, name: string, contentType: string): boolean {
  if (accept === undefined || accept.length === 0) return true
  const lowerName = name.toLowerCase()
  const lowerType = contentType.toLowerCase()

  return accept.some((raw) => {
    const rule = raw.trim().toLowerCase()
    if (rule === '') return false
    if (rule.startsWith('.')) return lowerName.endsWith(rule)
    if (rule.endsWith('/*')) return lowerType.startsWith(rule.slice(0, -1))
    return lowerType === rule
  })
}

/**
 * Every file id a submission references.
 *
 * Driven by the SCHEMA, not by the shape of the values. Recognising an
 * attachment by "an object with an id" would let a client omit a property and
 * have its reference quietly not claimed — the submission would be accepted
 * carrying a dangling file id, and the collector would delete the bytes a day
 * later. Reading only the paths the model says are file fields cannot be
 * fooled that way, and a text answer that happens to look like a file is not
 * one.
 *
 * A repeater contributes rows the schema cannot know about, so the walk
 * expands over whatever rows the data actually has.
 */
function referencedFileIds(schema: FormSchema, data: unknown): string[] {
  const ids: string[] = []

  const walk = (fields: readonly FieldDef[], value: unknown): void => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return
    const record = value as Record<string, unknown>

    for (const field of flattenPages(fields)) {
      const held = record[field.key]
      if (held === undefined) continue

      if (field.type === 'file') {
        if (!Array.isArray(held)) continue
        for (const entry of held) {
          const id = (entry as Record<string, unknown> | null)?.['id']
          if (typeof id === 'string') ids.push(id)
        }
        continue
      }

      if (field.type === 'group') {
        walk(field.fields ?? [], held)
        continue
      }

      if (field.type === 'repeater' && Array.isArray(held)) {
        for (const row of held) walk(field.fields ?? [], row)
      }
    }
  }

  walk(schema.model.fields, data)
  return ids
}

/** Re-exported so a host can see which paths a schema's file fields live at. */
export function fileFieldPaths(schema: FormSchema): string[] {
  return modelDataPaths(schema.model).filter(
    (path) => fileFieldAt(schema, path)?.type === 'file',
  )
}
