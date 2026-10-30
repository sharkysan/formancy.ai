import type { ServerDeps } from './deps.js'
import type { SubmissionPlace } from './ports.js'
import type { ListedSubmission } from './use-cases.js'

/** The most submissions one page holds, whatever is asked: a page is the point of paging. */
const MOST = 1000

export type SubmissionPage =
  /** `next` is what asks for the page after this one, or `null` when this is the last. */
  | { kind: 'page'; submissions: ListedSubmission[]; next: string | null }
  /** A cursor that names no place in the list. */
  | { kind: 'bad_cursor' }

/**
 * A form's submissions a page at a time, newest first (0222). Undefined for an unknown form, as
 * `listSubmissions` answers.
 *
 * **Keyset, not offset.** The next page is asked for from where the last one ended, a response's
 * time and id, so a response stored while somebody pages comes before the first page and moves
 * nothing after it. An offset would shift every row by one, and the next page would list again
 * the last row of the one before.
 *
 * **The cursor is opaque by contract and readable by design**, the time and the id joined by `_`,
 * because this package has no base64 to hide them with and there is nothing in them to hide: a
 * caller who may read the page may read both. One that names no place in the list is refused,
 * since read as the start it would list again every response the caller already has.
 */
export async function listSubmissionPage(
  deps: ServerDeps,
  path: string,
  { limit, after }: { limit: number; after?: string | undefined },
): Promise<SubmissionPage | undefined> {
  const form = await deps.storage.getFormByPath(path)
  if (form === undefined) return undefined
  const before = after === undefined ? undefined : placeOf(after)
  if (before === null) return { kind: 'bad_cursor' }
  const size = Math.min(Math.max(Number.isFinite(limit) ? Math.trunc(limit) : 1, 1), MOST)

  const versions = await deps.storage.listVersionsByForm(form.id)
  const versionNumberById = new Map(versions.map((version) => [version.id, version.version]))
  // One more than the page, so whether another follows is known without asking twice.
  const records = await deps.storage.pageSubmissionsByForm(form.id, size + 1, before)
  const shown = records.slice(0, size)
  const last = shown.at(-1)
  return {
    kind: 'page',
    submissions: shown.map((record) => ({
      id: record.id,
      version: versionNumberById.get(record.formVersionId) ?? 0,
      submittedAt: record.submittedAt,
      data: record.data,
    })),
    next: records.length > size && last !== undefined ? `${last.submittedAt}_${last.id}` : null,
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The place a cursor names, or `null` when it names none: a time and a uuid, joined by `_`. */
function placeOf(cursor: string): SubmissionPlace | null {
  const at = cursor.lastIndexOf('_')
  if (at === -1) return null
  const time = Date.parse(cursor.slice(0, at))
  const id = cursor.slice(at + 1)
  if (!Number.isFinite(time) || !UUID.test(id)) return null
  return { submittedAt: new Date(time).toISOString(), id }
}
