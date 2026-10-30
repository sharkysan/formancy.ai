import { ANSWER_KINDS, resolveText } from '@formancy/spec'
import type { FieldDef, FieldOption, FormSchema } from '@formancy/spec'
import type { FormText } from './words.js'

/** One answer, under its question, as a person reads it. */
export interface SaidAnswer {
  /** The data path the answer is stored at: `address.city`, `items[1].sku`. */
  readonly path: string
  /**
   * The field the answer is to: `path`, but a matrix's own for each of its rows, which are
   * answered one line each and are not fields. Where a "Change" goes (0204).
   */
  readonly field: string
  /** The question, and the questions it sits inside: "Address › City", "Items 2 › SKU". */
  readonly label: string
  /** The answer in words: an option's label, a date as the reader writes one, a file's name. */
  readonly said: string
}

/**
 * What a submission says, question by question, in document order (0193).
 *
 * A stored submission is what the server keeps — `{"country":"CH"}` — and not what anybody
 * answered: the person chose "Switzerland". Each answer is read back through its own question,
 * by the shape `ANSWER_KINDS` gives it ([0189](../../../docs/decisions/0189-every-answer-has-the-shape-its-type-says.md)):
 * a choice by its option's label, a list by its labels joined as the language joins one, a
 * matrix row by row, a date as the reader writes one, a file by its name.
 *
 * **Read against the version the submission was made on**, which is the caller's to supply:
 * read against another, an answer can belong to a question that no longer exists.
 *
 * **What cannot be named is said as stored**, not dropped — an option removed since, a value no
 * control wrote. A reviewer must see what was submitted, and a blank is not that. An unanswered
 * question has no line, and a field that collects nothing never has one.
 *
 * `text` gives the words around the answers in the form's language, and `locale` the language
 * the document's own questions and options are read in — its default when not given.
 */
export function answersInWords(schema: FormSchema, data: unknown, text: FormText, locale: string = schema.i18n?.defaultLocale ?? ''): SaidAnswer[] {
  return readAnswers(schema, data, text, locale, () => false).map(({ line }) => line)
}

/** A line of `readAnswers`: an answer in words, or a question asked and left without one. */
export interface ReadAnswer {
  readonly line: SaidAnswer
  readonly answered: boolean
}

/*
 * The one walk over a form's answers, which a submission read back and a review both take, so
 * the two cannot disagree about what counts as answered (0214). `asked` says of a field with no
 * answer whether the person is being asked it — a review's question, never a stored
 * submission's — and such a field has a line saying so, in its place.
 */
export function readAnswers(schema: FormSchema, data: unknown, text: FormText, locale: string, asked: (field: string) => boolean): ReadAnswer[] {
  const language = text.locale === '' ? 'en-GB' : text.locale
  const out: ReadAnswer[] = []
  const unanswered = (path: string, field: string, label: string): void => {
    if (asked(field)) out.push({ line: { path, field, label, said: text('answer.none') }, answered: false })
  }
  const labelOf = (def: FieldDef): string => resolveText(schema, def.label, locale) ?? def.key
  const optionLabel = optionLabeller(schema, locale)

  const visit = (fields: readonly FieldDef[], value: unknown, pathPrefix: string, labelPrefix: string): void => {
    for (const def of fields) {
      const { shape } = ANSWER_KINDS[def.type]
      if (shape === 'page') {
        visit(def.fields ?? [], value, pathPrefix, labelPrefix)
        continue
      }
      if (shape === 'nothing') continue
      const held = ownValue(value, def.key)
      const path = `${pathPrefix}${def.key}`
      const label = `${labelPrefix}${labelOf(def)}`
      if (shape === 'group') {
        visit(def.fields ?? [], held, `${path}.`, `${label} › `)
        continue
      }
      if (shape === 'rows') {
        if (!Array.isArray(held)) continue
        held.forEach((row, index) => {
          const position = text('answer.row', { label, position: index + 1 })
          visit(def.fields ?? [], row, `${path}[${String(index)}].`, `${position} › `)
        })
        continue
      }
      // A matrix answers row by row; one stored as something else is said as stored, below.
      if (shape === 'matrix' && (held === undefined || held === null || isRecord(held))) {
        for (const row of def.rows ?? []) {
          const column = isRecord(held) ? ownValue(held, row.value) : undefined
          const rowPath = `${path}.${row.value}`
          const rowLabel = `${label} › ${resolveText(schema, row.label, locale) ?? row.value}`
          if (column === undefined || column === null) unanswered(rowPath, path, rowLabel)
          else out.push({ line: { path: rowPath, field: path, label: rowLabel, said: optionLabel(def.options, column) }, answered: true })
        }
        continue
      }
      const said = sayAnswer(def, held, optionLabel, text, language)
      if (said === undefined) unanswered(path, path, label)
      else out.push({ line: { path, field: path, label, said }, answered: true })
    }
  }
  visit(schema.model.fields, data, '', '')
  return out
}

/**
 * One field's answer in words, as a submission read back says it — a matrix's rows joined as a
 * list, "Food: High and Room: Low" — or nothing when it has none. What a field a computed rule
 * writes is drawn as, where its own control has no read-only state (0216).
 */
export function answerInWords(schema: FormSchema, def: FieldDef, value: unknown, text: FormText, locale: string = schema.i18n?.defaultLocale ?? ''): string {
  const language = text.locale === '' ? 'en-GB' : text.locale
  const optionLabel = optionLabeller(schema, locale)
  if (ANSWER_KINDS[def.type].shape === 'matrix' && isRecord(value)) {
    const rows = (def.rows ?? []).flatMap((row) => {
      const column = ownValue(value, row.value)
      if (column === undefined || column === null) return []
      return [`${resolveText(schema, row.label, locale) ?? row.value}: ${optionLabel(def.options, column)}`]
    })
    return list(rows, language)
  }
  return sayAnswer(def, value, optionLabel, text, language) ?? ''
}

/** An option's label in the document's language, or what was stored when no option has it. */
function optionLabeller(schema: FormSchema, locale: string) {
  return (options: readonly FieldOption[] | undefined, value: unknown): string => {
    const option = options?.find((candidate) => candidate.value === value)
    return option === undefined ? stored(value) : (resolveText(schema, option.label, locale) ?? option.value)
  }
}

/** One answer in words, or `undefined` when there is none to say. */
function sayAnswer(
  def: FieldDef,
  value: unknown,
  optionLabel: (options: readonly FieldOption[] | undefined, value: unknown) => string,
  text: FormText,
  language: string,
): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (Array.isArray(value) && value.length === 0) return undefined
  switch (ANSWER_KINDS[def.type].shape) {
    case 'boolean':
      return typeof value === 'boolean' ? text(value ? 'answer.yes' : 'answer.no') : stored(value)
    case 'number':
      return typeof value === 'number' ? new Intl.NumberFormat(language).format(value) : stored(value)
    case 'temporal':
      return typeof value === 'string' ? temporal(def, value, language) : stored(value)
    case 'choice':
      return optionLabel(def.options, value)
    case 'choices':
      return Array.isArray(value)
        ? list(
            value.map((item) => optionLabel(def.options, item)),
            language,
          )
        : stored(value)
    case 'files':
      return Array.isArray(value)
        ? list(
            value.map((file) => (isRecord(file) && typeof file['name'] === 'string' ? file['name'] : stored(file))),
            language,
          )
        : stored(value)
    case 'signature':
      if (isRecord(value) && typeof value['typed'] === 'string') return value['typed']
      return text('answer.drawnSignature')
    default:
      return stored(value)
  }
}

/** A date as the reader writes one; a time as it reads everywhere; an instant in UTC, said so. */
function temporal(def: FieldDef, value: string, language: string): string {
  if (def.type === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Intl.DateTimeFormat(language, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`))
  }
  if (def.type === 'datetime' && !Number.isNaN(Date.parse(value))) {
    const said = new Intl.DateTimeFormat(language, { dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(value))
    return `${said} UTC`
  }
  return value
}

/** An answer as it was stored, for one the question does not take: a record is data, not "[object Object]". */
function stored(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value)
}

function list(items: readonly string[], language: string): string {
  return new Intl.ListFormat(language, { type: 'conjunction' }).format(items)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** An answer the value holds as its own, never one every object inherits (0185). */
function ownValue(value: unknown, key: string): unknown {
  return isRecord(value) && Object.hasOwn(value, key) ? value[key] : undefined
}
