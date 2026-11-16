import type { FormSchema, LogicRule, TemporalFieldType } from '@formancy/spec'
import { TEMPORAL_FIELD_TYPES, modelDataFields, temporalShape, temporalShapeRegExp } from '@formancy/spec'
import { inModel, rowScopeOf } from '@formancy/core/authoring'
import { comparedFields, parse, rewriteComparedLiterals } from '@formancy/expressions'
import { ruleKindLabel } from './logic.js'
import type { BuilderText } from './messages.js'
import { dataPathOf, locate, rulePathOf } from './navigate.js'
import type { Refusal } from './session.js'

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
 * rule's `item.at` is the model's `legs[].at`, and a field inside a page is found by its data
 * path, which has no page in it. A literal that was not at the old width is left, as it was a
 * misshapen literal before this edit.
 *
 * **Two fields compared are refused, not rewritten.** A rule such as `opens < closes` is right
 * only while both are written in one shape, and no edit to one field changes the other, so a
 * change that would split a pair that is alike is refused and names the other field. A pair
 * already split, or still alike afterwards, is not this edit's.
 *
 * **Refused with the validator's words.** A bound that cannot follow is left at its width, so
 * the validator that has to accept the document refuses it, in the sentence it always uses
 * (`bounds.width`). A rule has no such sentence in the validator, so the builder has one.
 */
type Precision = number | undefined

/** What stops a rule following the change. */
interface Stuck {
  readonly reason: 'width' | 'form' | 'pair'
  /** The rule's position, counted from one as the author counts. */
  readonly number: number
  readonly kind: LogicRule['kind']
  readonly target: string
  /** The field as the model writes it. */
  readonly field: string
  /** The text that cannot be written at the new width, or the other field of a pair. */
  readonly other: string
}

/**
 * Set the precision of the field at `keyPath` on `draft`, in place, and carry along what is
 * written at its width. Returns a refusal in the session's language, or nothing; `attempt` then
 * validates the draft, which refuses a bound that could not follow in the validator's own
 * sentence (`bounds.width`) and discards the draft whole. The body of the session's `precision`
 * command.
 */
export function carryPrecision(draft: FormSchema, keyPath: readonly string[], requested: unknown, text: BuilderText): Refusal | undefined {
  const precision = requested as Precision
  const found = locate(draft, keyPath)
  const field = found?.siblings[found.index]
  if (found === undefined || field === undefined) {
    return { ok: false, path: '/model/fields', message: text('refuse.noField', { path: keyPath.join('.') }) }
  }
  const record = field as unknown as Record<string, unknown>
  const before = field.precision
  if (precision === undefined) delete record.precision
  else record.precision = precision
  // Only a precision the format can read has a width to write at; any other is the validator's
  // to refuse, and rewriting towards it would throw.
  if ((field.type !== 'time' && field.type !== 'datetime') || !readable(before) || !readable(precision)) return undefined

  const change = { type: field.type, from: before, to: precision }
  for (const bound of ['earliest', 'latest', 'default'] as const) {
    const value = record[bound]
    if (typeof value === 'string') record[bound] = rewidth(change, value) ?? value
  }
  // Rules name a field by its data path, which has no page in it, so the key path is not it.
  const modelPath = rulePathOf(draft, dataPathOf(draft, keyPath) ?? '')
  const stuck = rewriteRules(draft, modelPath, change) ?? splitPairs(draft, modelPath, change)
  if (stuck === undefined) return undefined
  const key = ({ width: 'refuse.precisionRule', form: 'refuse.precisionForm', pair: 'refuse.precisionPair' } as const)[stuck.reason]
  return { ok: false, path: '/logic/rules', message: text(key, { ...stuck, kind: ruleKindLabel(stuck.kind, text) }) }
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
  readonly type: 'time' | 'datetime'
  readonly from: Precision
  readonly to: Precision
}

const PARTS: Record<Change['type'], RegExp> = {
  time: /^(\d\d:\d\d)(?::(\d\d))?(?:\.(\d+))?$/,
  datetime: /^(\d{4}-\d\d-\d\dT\d\d:\d\d):(\d\d)(?:\.(\d+))?Z$/,
}

const allZero = (digits: string): boolean => !/[^0]/.test(digits)

/**
 * `value` written at the new width, the same moment; or `value` itself when it was not written
 * at the old one (not ours to correct); or nothing when no exact spelling exists.
 */
function rewidth({ type, from, to }: Change, value: string): string | undefined {
  if (!temporalShapeRegExp(type, from).test(value)) return value
  const [, head = '', seconds = '00', fraction = ''] = PARTS[type].exec(value) ?? []
  const digits = to ?? 0
  if (!allZero(fraction.slice(digits))) return undefined
  // Without a precision a time is HH:MM, which has always meant seconds 00, so it holds no more
  // than a zero second and a zero fraction. A date and time has seconds either way.
  if (type === 'time' && to === undefined) return seconds === '00' ? head : undefined
  const body = `${head}:${seconds}${digits === 0 ? '' : `.${fraction.slice(0, digits).padEnd(digits, '0')}`}`
  return type === 'time' ? body : `${body}Z`
}

/** Every rule that compares the field with text, written again at the new width; the first that cannot follow comes back. */
function rewriteRules(draft: FormSchema, modelPath: string, change: Change): Stuck | undefined {
  for (const [index, rule] of (draft.logic?.rules ?? []).entries()) {
    const rowScope = rowScopeOf(rule.target)
    const stuck = (reason: Stuck['reason'], other: string): Stuck => ({
      reason,
      number: index + 1,
      kind: rule.kind,
      target: rule.target,
      field: modelPath,
      other,
    })
    const mine = (read: string): boolean => inModel(read, rowScope) === modelPath

    if (rule.cel !== undefined && rule.cel !== '') {
      let cannot: string | undefined
      const outcome = rewriteComparedLiterals(rule.cel, (compared) => {
        if (!mine(compared.path)) return undefined
        const text = rewidth(change, compared.literal)
        cannot ??= text === undefined ? compared.literal : undefined
        return text
      })
      if (cannot !== undefined) return stuck('width', cannot)
      // A policy refusal is a literal written in a form that is not its plain text (an escape, a
      // raw or triple-quoted string). `rewrite_broke_source` and `rewrite_changed_comparisons` are
      // defensive: no plain quoted run of digits and colons reaches them. A rule that does not
      // parse is left alone; publish refuses it, as it did before this edit.
      if (!outcome.ok) {
        if (outcome.error.kind === 'policy') return stuck('form', rule.cel)
      } else if (outcome.changed) rule.cel = outcome.source
    }

    const refused = rewriteEditor(rule.editor, mine, change)
    if (refused !== undefined) return stuck('width', refused)
  }
  return undefined
}

/** A rule comparing this field with a temporal field written in its shape until now and not after. */
function splitPairs(draft: FormSchema, modelPath: string, change: Change): Stuck | undefined {
  const fields = new Map(modelDataFields(draft.model).map(({ path, def }) => [path, def] as const))
  for (const [index, rule] of (draft.logic?.rules ?? []).entries()) {
    const parsed = rule.cel === undefined ? undefined : parse(rule.cel)
    if (parsed === undefined || !parsed.ok) continue
    const rowScope = rowScopeOf(rule.target)
    for (const compared of comparedFields(parsed.ast)) {
      const [left, right] = [inModel(compared.left, rowScope), inModel(compared.right, rowScope)]
      const other = left === modelPath ? right : right === modelPath ? left : undefined
      const def = other === undefined ? undefined : fields.get(other)
      if (other === undefined || def === undefined || !(TEMPORAL_FIELD_TYPES as readonly string[]).includes(def.type)) continue
      const alike = (own: Precision): boolean => temporalShape(change.type, own) === temporalShape(def.type as TemporalFieldType, def.precision)
      if (alike(change.from) && !alike(change.to)) {
        return { reason: 'pair', number: index + 1, kind: rule.kind, target: rule.target, field: modelPath, other }
      }
    }
  }
  return undefined
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
