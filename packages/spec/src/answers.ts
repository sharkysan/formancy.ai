import type { FieldType } from './types.js'

/**
 * What each field type's answer is: the one place the format decides it (0189).
 *
 * **Data rather than a function**, because three readers need the same decision and a
 * test can only compare data: the engine refuses an answer of another shape, browser and
 * server alike; the type a form's submissions are given is printed from it; and the
 * answer table in the documentation is checked against it. Before this, the shape was a
 * prose table and a set of per-constraint checks that read a value's type only when a
 * constraint needed it — so a `text` field with no constraints stored whatever was posted.
 *
 * **A `Record` over every field type**, so a type added to `FIELD_TYPES` without an
 * answer here is a compile error rather than a type whose answers nothing checks.
 */
export const ANSWER_KINDS = {
  text: { shape: 'text', nullable: true },
  textarea: { shape: 'text', nullable: true },
  // The formatted-text grammar is a string, never a tree: the tree is parsed for display
  // and never stored (0052).
  richtext: { shape: 'text', nullable: true },
  // Travels with the submission and is never shown; the host or a prefill writes it.
  hidden: { shape: 'text', nullable: true },
  number: { shape: 'number', nullable: true },
  checkbox: { shape: 'boolean', nullable: true },
  date: { shape: 'temporal', nullable: true },
  time: { shape: 'temporal', nullable: true },
  datetime: { shape: 'temporal', nullable: true },
  select: { shape: 'choice', nullable: true },
  radio: { shape: 'choice', nullable: true },
  // A list is empty as `[]` and never null: `'a' in topics` is false against `[]` and an
  // error against null, so a rule reading an untouched list must never meet a null.
  selectboxes: { shape: 'choices', nullable: false },
  ranking: { shape: 'choices', nullable: false },
  // `{}` when untouched, the rows answered when not (0139).
  matrix: { shape: 'matrix', nullable: false },
  file: { shape: 'files', nullable: false },
  signature: { shape: 'signature', nullable: true },
  // Collects nothing: a value handed in for one is dropped, as a computed field's is.
  static: { shape: 'nothing', nullable: false },
  group: { shape: 'group', nullable: false },
  // Scopes nothing: its fields' answers sit beside the page's siblings.
  page: { shape: 'page', nullable: false },
  repeater: { shape: 'rows', nullable: false },
} as const satisfies Record<FieldType, AnswerKind>

export interface AnswerKind {
  /** What the answer is; `AnswerShape` says what each one holds. */
  readonly shape: AnswerShape
  /**
   * Whether `null` is a way of saying "not answered". It is for one answer, because a
   * control that is cleared writes it; it is not for a list or a map, whose empty is `[]`
   * or `{}`. An absent key is unanswered for every type.
   */
  readonly nullable: boolean
}

/**
 * - `text` — a string; `''` is unanswered.
 * - `temporal` — a string in its type's `TEMPORAL_SHAPES` form.
 * - `number` — a finite number.
 * - `boolean` — `true` or `false`.
 * - `choice` — one option's `value`, a string.
 * - `choices` — an array of option values.
 * - `matrix` — an object from a row's value to an option's value.
 * - `files` — an array of `StoredFile`.
 * - `signature` — a `SignatureAnswer`.
 * - `nothing` — no answer at all.
 * - `group` — an object holding its fields' answers.
 * - `page` — no value of its own; its fields' answers sit in its parent.
 * - `rows` — an array of objects, each carrying `_id` and its fields' answers.
 */
export type AnswerShape =
  | 'text'
  | 'temporal'
  | 'number'
  | 'boolean'
  | 'choice'
  | 'choices'
  | 'matrix'
  | 'files'
  | 'signature'
  | 'nothing'
  | 'group'
  | 'page'
  | 'rows'

/**
 * One attached file, as a submission stores it — never the bytes.
 *
 * What is stored is what the file is and where it went, so a submission read back years
 * later is small, readable on its own, and says what was attached even if the object
 * store has since been emptied.
 *
 * Declared here because it is part of the answer a `file` field stores, which is the
 * format's business: it was declared three times, in each renderer and privately in the
 * engine, and a field added to one would have been a stored answer the other two called
 * malformed.
 */
export interface StoredFile {
  /** Stable within the submission; how a row is keyed and removed. */
  id: string
  name: string
  /** Bytes. */
  size: number
  contentType: string
  /** Where the deployment keeps the bytes; opaque to everything but the server. */
  storageKey: string
}

/**
 * Whether a value is a `StoredFile`: three non-empty strings, a content type and a size
 * that is a whole number of bytes.
 */
export function isStoredFile(value: unknown): value is StoredFile {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const file = value as Record<string, unknown>
  return (
    ['id', 'name', 'storageKey'].every((key) => typeof file[key] === 'string' && file[key].length > 0) &&
    typeof file['contentType'] === 'string' &&
    typeof file['size'] === 'number' &&
    Number.isSafeInteger(file['size']) &&
    file['size'] >= 0
  )
}

/**
 * Whether `value` has the shape `shape` says, ignoring everything a field's own properties
 * add — which options, which rows, how many, how long. Those are each constraint's own
 * check; this is the question before all of them, and the only one a field with no
 * constraints is asked. `null` and an absent value are `nullable`'s business, not this.
 */
export function fitsAnswerShape(shape: AnswerShape, value: unknown): boolean {
  switch (shape) {
    case 'text':
      return typeof value === 'string'
    // `''` is not unanswered here: a cleared date or choice is null, and an empty string
    // is a value no control writes.
    case 'temporal':
    case 'choice':
      return typeof value === 'string' && value !== ''
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
    case 'boolean':
      return typeof value === 'boolean'
    case 'choices':
      return Array.isArray(value) && value.every((item) => typeof item === 'string')
    case 'files':
      return Array.isArray(value) && value.every(isStoredFile)
    case 'rows':
      return Array.isArray(value)
    case 'matrix':
    case 'signature':
    case 'group':
      return value !== null && typeof value === 'object' && !Array.isArray(value)
    case 'nothing':
    case 'page':
      return false
  }
}
