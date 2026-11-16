import type { FormSchema, SchemaError, TemporalFieldType } from '@formancy/spec'
import { temporalShapeRegExp } from '@formancy/spec'
import { validateSchema } from '@formancy/spec/validate'
import { inModel, rowScopeOf } from '@formancy/core/authoring'
import { rewriteComparedLiterals } from '@formancy/expressions'
import { ruleKindLabel } from './logic.js'
import type { BuilderText } from './messages.js'
import { locate, rulePathOf } from './navigate.js'

/**
 * Changing the precision of a time or a date and time, carrying along what is written at its
 * width (0238).
 *
 * **Why the change has to carry anything.** An answer has the field's width, and a bound, a
 * default and the text a rule compares the field with are all compared with an answer as text,
 * which is right only between strings of one shape (0067). Changing `precision` alone left each
 * at the old width: the validator refused the bounds at once, and a rule literal was refused only
 * at publish, far from the box that caused it.
 *
 * **Exact or refused, never guessed.** Widening pads with zeros, which names the same moment.
 * Narrowing cuts digits, and is exact only when every digit cut is zero: `08:00:00.250` at 0
 * would be a different bound. Removing the precision of a time is narrowing to `HH:MM`, which
 * holds no seconds at all, and is exact when the seconds are zero because `HH:MM` has always
 * meant seconds 00. A date and time with no precision and one with precision 0 share a shape,
 * so there is nothing to write between them.
 *
 * **What is rewritten.** `earliest`, `latest` and `default`, and every string a rule compares
 * the field with: the text of the condition, spliced where the literal stands (the author's
 * spacing and quotes stay) and the value the visual editor reopens the rule from, because that
 * recompiles the condition and would restore the old width over the rewrite. Which comparisons
 * are about this field is `crossWidthComparisons`' question, answered by the same read: a row
 * rule's `item.at` is the model's `legs[].at`. A literal that was not at the old width is left,
 * as it was a misshapen literal before this edit.
 *
 * **Refused with the validator's words.** A bound that cannot follow is left at its width, so
 * the validator that has to accept the document refuses it, in the sentence it always uses
 * (`bounds.width`). A rule has no such sentence in the validator, so the builder has one.
 */
export interface StuckLiteral {
  /** The rule's position, counted from one as the author counts. */
  readonly number: number
  readonly kind: string
  readonly target: string
  /** The field as the model writes it. */
  readonly field: string
  /** The text that cannot be written at the new width without changing its meaning. */
  readonly literal: string
}

export type Reprecision = { ok: true; schema: FormSchema } | { ok: false; errors: SchemaError[]; literals: StuckLiteral[] }

/** The width of the answers of a type: the digits after the seconds, or none for a time that has no seconds. */
type Precision = number | undefined

export function reprecise(schema: FormSchema, path: string, precision: Precision): Reprecision {
  // A JSON round trip, as the session copies a document: this package runs without
  // structuredClone in its lib on purpose.
  const next = JSON.parse(JSON.stringify(schema)) as FormSchema
  const found = locate(next, path.split('.'))
  const field = found?.siblings[found.index]
  const before = field?.precision
  const stuck: StuckLiteral[] = []

  if (field !== undefined) {
    const record = field as unknown as Record<string, unknown>
    if (precision === undefined) delete record.precision
    else record.precision = precision
    // Only a precision the format can read has a width to write at; any other is the
    // validator's to refuse, and rewriting towards it would throw.
    if ((field.type === 'time' || field.type === 'datetime') && readable(before) && readable(precision)) {
      const change = { type: field.type, from: before, to: precision }
      for (const bound of ['earliest', 'latest', 'default'] as const) {
        const value = record[bound]
        if (typeof value === 'string') record[bound] = rewidth(change, value) ?? value
      }
      stuck.push(...rewriteRules(next, rulePathOf(next, path), change))
    }
  }

  const verdict = validateSchema(next)
  const errors = verdict.valid ? [] : verdict.errors
  return errors.length === 0 && stuck.length === 0 ? { ok: true, schema: next } : { ok: false, errors, literals: stuck }
}

/**
 * The body of the session's property command: set `property` to `value` on the field at
 * `keyPath`, which for `precision` is `reprecise`. Here rather than in the session because that
 * file is at its size ceiling and the command is one subject with the change it hooks.
 */
export function applyFieldProperty(
  draft: FormSchema,
  keyPath: readonly string[],
  property: string,
  value: unknown,
  text: BuilderText,
): { ok: false; path: string; message: string } | undefined {
  const found = locate(draft, keyPath)
  if (found === undefined) return { ok: false, path: '/model/fields', message: text('refuse.noField', { path: keyPath.join('.') }) }
  if (property === 'precision') {
    const outcome = reprecise(draft, keyPath.join('.'), value as Precision)
    if (outcome.ok) {
      // Assigned key by key rather than returned, because `attempt` commits the draft it was
      // given and a new object would be dropped.
      const mutable = draft as unknown as Record<string, unknown>
      for (const key of Object.keys(mutable)) delete mutable[key]
      Object.assign(draft, outcome.schema)
      return undefined
    }
    const first = outcome.errors[0]
    if (first !== undefined) return { ok: false, path: first.path, message: text.error(first) }
    const stuck = outcome.literals[0]!
    return {
      ok: false,
      path: '/logic/rules',
      message: text('refuse.precisionRule', { ...stuck, kind: ruleKindLabel(stuck.kind as never, text) }),
    }
  }
  const field = found.siblings[found.index]! as unknown as Record<string, unknown>
  if (value === undefined) delete field[property]
  else field[property] = JSON.parse(JSON.stringify(value)) as unknown
  return undefined
}

/** Whether the format has a shape for this precision, which it answers by throwing for any it has not. */
function readable(precision: Precision): boolean {
  try {
    temporalShapeRegExp('time', precision)
    return true
  } catch {
    return false
  }
}

interface Change {
  readonly type: TemporalFieldType
  readonly from: Precision
  readonly to: Precision
}

const PARTS: Record<'time' | 'datetime', RegExp> = {
  time: /^(\d\d:\d\d)(?::(\d\d))?(?:\.(\d+))?$/,
  datetime: /^(\d{4}-\d\d-\d\dT\d\d:\d\d):(\d\d)(?:\.(\d+))?Z$/,
}

const allZero = (digits: string): boolean => !/[^0]/.test(digits)

/**
 * `value` written at the new width, the same moment; or `value` itself when it was not written
 * at the old one (not ours to correct); or nothing when no exact spelling exists.
 */
function rewidth({ type, from, to }: Change, value: string): string | undefined {
  if (type === 'date' || !temporalShapeRegExp(type, from).test(value)) return value
  const [, head = '', seconds = '00', fraction = ''] = PARTS[type].exec(value) ?? []
  const digits = to ?? 0
  if (!allZero(fraction.slice(digits))) return undefined
  // Without a precision a time is HH:MM, which has always meant seconds 00, so it holds no more
  // than a zero second and a zero fraction. A date and time has seconds either way.
  if (type === 'time' && to === undefined) return seconds === '00' ? head : undefined
  const body = `${head}:${seconds}${digits === 0 ? '' : `.${fraction.slice(0, digits).padEnd(digits, '0')}`}`
  return type === 'time' ? body : `${body}Z`
}

/** Every rule that compares the field with text, written again at the new width; those that cannot follow come back. */
function rewriteRules(draft: FormSchema, modelPath: string, change: Change): StuckLiteral[] {
  const stuck: StuckLiteral[] = []
  for (const [index, rule] of (draft.logic?.rules ?? []).entries()) {
    const rowScope = rowScopeOf(rule.target)
    const about = (literal: string): StuckLiteral => ({ number: index + 1, kind: rule.kind, target: rule.target, field: modelPath, literal })
    const mine = (read: string): boolean => inModel(read, rowScope) === modelPath

    if (rule.cel !== undefined && rule.cel !== '') {
      let cannot: string | undefined
      const outcome = rewriteComparedLiterals(rule.cel, (compared) => {
        if (!mine(compared.path)) return undefined
        const text = rewidth(change, compared.literal)
        cannot ??= text === undefined ? compared.literal : undefined
        return text
      })
      if (cannot !== undefined) stuck.push(about(cannot))
      // A policy refusal is a literal that is not plain text: not ours to guess at. An
      // expression that does not parse was refused when the document was.
      else if (!outcome.ok) {
        if (outcome.error.kind === 'policy') stuck.push(about(rule.cel))
      } else if (outcome.changed) rule.cel = outcome.source
    }

    const refused = rewriteEditor(rule.editor, mine, change)
    if (refused !== undefined) stuck.push(about(refused))
  }
  return stuck
}

/**
 * The visual editor's conditions, written again in place: the value of every condition on the
 * field. Shape-checked rather than cast, as `repathEditor` is: `editor` is `unknown` in the
 * spec because another tool's metadata may be anything. Returns the first value that cannot follow.
 */
function rewriteEditor(editor: unknown, mine: (read: string) => boolean, change: Change): string | undefined {
  if (typeof editor !== 'object' || editor === null) return undefined
  const { conditions } = editor as { conditions?: unknown }
  if (!Array.isArray(conditions)) return undefined
  for (const condition of conditions as unknown[]) {
    if (typeof condition !== 'object' || condition === null) continue
    const item = condition as { conditions?: unknown; field?: unknown; value?: unknown }
    if (Array.isArray(item.conditions)) {
      const refused = rewriteEditor(item, mine, change)
      if (refused !== undefined) return refused
      continue
    }
    if (typeof item.field !== 'string' || typeof item.value !== 'string' || !mine(item.field)) continue
    const text = rewidth(change, item.value)
    if (text === undefined) return item.value
    item.value = text
  }
  return undefined
}
