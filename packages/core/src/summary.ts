import { ANSWER_KINDS, resolveText } from '@formancy/spec'
import type { FieldDef, FormSchema } from '@formancy/spec'
import type { FormText } from './words.js'

/** One question's answers, together. */
export type QuestionSummary =
  | (QuestionHeader & { readonly kind: 'choices'; readonly counts: readonly OptionCount[] })
  | (QuestionHeader & { readonly kind: 'number'; readonly min: number; readonly max: number; readonly mean: number })
  | (QuestionHeader & { readonly kind: 'answered' })

interface QuestionHeader {
  /** The question's data path, a repeater's rows as `items[].sku`, a matrix row as `rating.taste`. */
  readonly field: string
  /** The question, and the questions it sits inside, in the document's language. */
  readonly label: string
  /** How many submissions answered it — for a repeater's question, how many rows did. */
  readonly answered: number
}

/** How many chose one option: its value, its label, its count. */
export interface OptionCount {
  readonly value: string | boolean
  readonly label: string
  readonly count: number
}

/*
 * What a form's submissions say together, question by question (0206), in document order: how
 * many answered, and for a choice, a tick box or a matrix row how many chose each option, by its
 * label; for a number its range and mean. Text, dates, files and the rest are read one at a time,
 * so of them it says how many there are to read.
 *
 * Read against one version of the form, which the caller supplies, as `answersInWords` is: the
 * submissions of another may answer different questions. Emptiness is `required`'s: nothing,
 * `null`, `''` and `[]` are not answers. A value no option names is counted as itself, after the
 * options, so the counts never add up to less than was answered. A repeater's rows are counted
 * together under each of its questions.
 *
 * **An entry of its own, `@formancy/core/summary`**, because it is the admin's and no form's: in
 * `/words` every renderer would carry it. `text` is handed in — `createFormText` from `/words` —
 * so the entry shares nothing with that one.
 */
export function summariseAnswers(
  schema: FormSchema,
  submissions: readonly unknown[],
  text: FormText,
  locale: string = schema.i18n?.defaultLocale ?? '',
): QuestionSummary[] {
  const summary = createSummary(schema, text, locale)
  for (const submission of submissions) summary.add(submission)
  return summary.questions()
}

/** A summary counted one submission at a time: what `summariseAnswers` says of all of them. */
export interface Summary {
  /** Count one submission's answers. */
  add(submission: unknown): void
  /** The questions as counted so far, in document order. */
  questions(): QuestionSummary[]
}

/*
 * `summariseAnswers` one submission at a time (0224), so the server can count a page of them
 * and hold no more than the page. A number keeps its count, sum and bounds rather than every
 * answer: the answers were spread into `Math.min`, which throws past the engine's argument
 * limit, measured at 120,000 on Node 22.
 */
export function createSummary(schema: FormSchema, text: FormText, locale: string = schema.i18n?.defaultLocale ?? ''): Summary {
  const tallies = new Map<string, Tally>()
  const labelOf = (def: FieldDef): string => resolveText(schema, def.label, locale) ?? def.key
  const said = (value: unknown, def: FieldDef): string =>
    resolveText(schema, def.options?.find((option) => option.value === value)?.label, locale) ?? String(value)

  const tallyOf = (field: string, label: string, kind: Tally['kind'], options: readonly OptionCount[] = []): Tally => {
    const known = tallies.get(field)
    if (known !== undefined) return known
    const counts = new Map(options.map((option) => [option.value, option]))
    const fresh: Tally = { field, label, kind, answered: 0, counts, numbered: 0, sum: 0, min: Infinity, max: -Infinity }
    tallies.set(field, fresh)
    return fresh
  }
  const count = (tally: Tally, value: string | boolean, label: string): void => {
    const held = tally.counts.get(value)
    tally.counts.set(value, { value, label: held?.label ?? label, count: (held?.count ?? 0) + 1 })
  }

  const visit = (fields: readonly FieldDef[], value: unknown, path: string, label: string): void => {
    for (const def of fields) {
      const { shape } = ANSWER_KINDS[def.type]
      if (shape === 'nothing') continue
      if (shape === 'page') {
        visit(def.fields ?? [], value, path, label)
        continue
      }
      const field = `${path}${def.key}`
      const question = `${label}${labelOf(def)}`
      const held = ownValue(value, def.key)
      if (shape === 'group') {
        visit(def.fields ?? [], held, `${field}.`, `${question} › `)
        continue
      }
      if (shape === 'rows') {
        // Declared for every submission, so a question's place is the document's, not the first row's.
        visit(def.fields ?? [], undefined, `${field}[].`, `${question} › `)
        if (Array.isArray(held)) for (const row of held) visit(def.fields ?? [], row, `${field}[].`, `${question} › `)
        continue
      }
      if (shape === 'matrix') {
        for (const row of def.rows ?? []) {
          const options = (def.options ?? []).map((option) => ({ value: option.value, label: said(option.value, def), count: 0 }))
          const tally = tallyOf(`${field}.${row.value}`, `${question} › ${resolveText(schema, row.label, locale) ?? row.value}`, 'choices', options)
          const column = isRecord(held) ? ownValue(held, row.value) : undefined
          if (typeof column !== 'string' || column === '') continue
          tally.answered += 1
          count(tally, column, said(column, def))
        }
        continue
      }
      if (shape === 'choice' || shape === 'choices') {
        const options = (def.options ?? []).map((option) => ({ value: option.value, label: said(option.value, def), count: 0 }))
        const tally = tallyOf(field, question, 'choices', options)
        const chosen = Array.isArray(held) ? held : held === undefined || held === null || held === '' ? [] : [held]
        if (chosen.length === 0) continue
        tally.answered += 1
        for (const one of chosen) count(tally, String(one), said(one, def))
        continue
      }
      if (shape === 'boolean') {
        const tally = tallyOf(field, question, 'choices', [
          { value: true, label: text('answer.yes'), count: 0 },
          { value: false, label: text('answer.no'), count: 0 },
        ])
        if (typeof held !== 'boolean') continue
        tally.answered += 1
        count(tally, held, text(held ? 'answer.yes' : 'answer.no'))
        continue
      }
      const tally = tallyOf(field, question, shape === 'number' ? 'number' : 'answered')
      if (held === undefined || held === null || held === '' || (Array.isArray(held) && held.length === 0)) continue
      tally.answered += 1
      if (typeof held === 'number' && Number.isFinite(held)) {
        tally.numbered += 1
        tally.sum += held
        tally.min = Math.min(tally.min, held)
        tally.max = Math.max(tally.max, held)
      }
    }
  }
  // Every question is declared before any answer is counted, in the document's order, so one
  // nobody answered still has its line.
  visit(schema.model.fields, undefined, '', '')

  return {
    add: (submission) => visit(schema.model.fields, submission, '', ''),
    questions: () =>
      [...tallies.values()].map((tally): QuestionSummary => {
        const header = { field: tally.field, label: tally.label, answered: tally.answered }
        if (tally.kind === 'choices') return { ...header, kind: 'choices', counts: [...tally.counts.values()] }
        if (tally.kind === 'number' && tally.numbered > 0) {
          return { ...header, kind: 'number', min: tally.min, max: tally.max, mean: tally.sum / tally.numbered }
        }
        return { ...header, kind: 'answered' }
      }),
  }
}

interface Tally {
  readonly field: string
  readonly label: string
  readonly kind: 'choices' | 'number' | 'answered'
  answered: number
  readonly counts: Map<string | boolean, OptionCount>
  /** A number's: how many were numbers, their sum and their bounds. */
  numbered: number
  sum: number
  min: number
  max: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** An answer the value holds as its own, never one every object inherits (0185). */
function ownValue(value: unknown, key: string): unknown {
  return isRecord(value) && Object.hasOwn(value, key) ? value[key] : undefined
}
