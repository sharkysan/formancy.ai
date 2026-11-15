import { comparedFields, comparedLiterals, parse } from '@formancy/expressions'
import type { ExpressionAst } from '@formancy/expressions'
import { TEMPORAL_FIELD_TYPES, modelDataFields, temporalExample, temporalShape } from '@formancy/spec'
import type { FieldType, FormSchema, LogicRule, TemporalFieldType } from '@formancy/spec'
import { ROW_ITEM, inModel, rowScopeOf } from './unknown-paths.js'

/**
 * Rules that compare a temporal answer with something of another width (spec 6, 0237).
 *
 * **Why it is a defect.** A field can declare how many digits follow its seconds, and every
 * answer to it has that width. A rule compares an answer as text, and text orders the way time
 * does only between strings of one shape (0067), so `"09:00"` against a precision-3 time, or a
 * precision-3 `datetime` against a precision-6 one, holds at the wrong moment and `==` holds for
 * nobody. Every other gate passes it: the expression type-checks and decides something for every
 * answer.
 *
 * **It refuses, where 0236 only warns.** No valid document could declare a precision before
 * version 6, so refusing here turns nothing valid into invalid, which is what made refusing
 * unavailable in 0236 (0097). A field without `precision` is not looked at: a literal compared
 * with it is `misshapenTemporalLiterals`' to warn about, and two such fields compared behave as
 * version 5 always did.
 *
 * **Shapes are compared, not lengths.** A `date` and a precision-1 `time` are both ten
 * characters and are not the same shape.
 *
 * **Not seen** (the named limit of 0237): a comparison through a list rule's own variable, as
 * in `steps.all(s, s.at >= startedAt)`. `@formancy/expressions` takes `s.at` for no field, as
 * 0236 chose.
 */
export interface CrossWidthComparison {
  /** The rule's target, as written. */
  target: string
  kind: LogicRule['kind']
  cel: string
  /** The fields compared, as the model writes them: `legs[].at` for `item.at` in a row of `legs`. */
  paths: readonly string[]
  /** The text compared with the field, where one side is text. */
  literal?: string
  /** What the author has to change, in their words. */
  message: string
}

interface TemporalField {
  readonly type: TemporalFieldType
  readonly precision: number | undefined
}

type About = Pick<CrossWidthComparison, 'target' | 'kind' | 'cel'>

function isTemporal(type: FieldType): type is TemporalFieldType {
  return (TEMPORAL_FIELD_TYPES as readonly FieldType[]).includes(type)
}

/** What to do about it: the same three ways whichever comparison it is. */
const REMEDY =
  'Write the literal at the field’s width, give both fields one precision, or compare ' +
  '`timestamp(a) < timestamp(b)`, which compares to the millisecond and so cannot tell apart two answers closer than that.'

export function crossWidthComparisons(schema: FormSchema): CrossWidthComparison[] {
  const rules = schema.logic?.rules ?? []
  if (rules.length === 0) return []

  const fields = new Map<string, TemporalField>()
  for (const { path, def } of modelDataFields(schema.model)) {
    if (isTemporal(def.type)) fields.set(path, { type: def.type, precision: def.precision })
  }
  if (fields.size === 0) return []

  const found: CrossWidthComparison[] = []
  for (const rule of rules) {
    // A check names a validator and carries no expression, and an expression that does not
    // parse is refused at publish already.
    if (rule.cel === undefined || rule.cel === '') continue
    const parsed = parse(rule.cel)
    if (!parsed.ok) continue

    const about = { target: rule.target, kind: rule.kind, cel: rule.cel }
    found.push(...literalProblems(parsed.ast, rowScopeOf(rule.target), fields, about), ...fieldProblems(parsed.ast, rowScopeOf(rule.target), fields, about))
  }
  return found
}

function ruleOf(about: About): string {
  return `Rule on "${about.target}" (${about.kind})`
}

/** A literal compared with a field that declares a precision, and not written at it. */
function literalProblems(ast: ExpressionAst, rowScope: string | undefined, fields: ReadonlyMap<string, TemporalField>, about: About): CrossWidthComparison[] {
  const found: CrossWidthComparison[] = []
  for (const compared of comparedLiterals(ast)) {
    const path = inModel(compared.path, rowScope)
    const field = fields.get(path)
    if (field?.precision === undefined) continue
    if (new RegExp(temporalShape(field.type, field.precision)).test(compared.literal)) continue
    found.push({
      ...about,
      paths: [path],
      literal: compared.literal,
      message:
        compared.literal === ''
          ? emptyLiteralMessage(about, path, compared.path, rowScope)
          : `${ruleOf(about)} compares "${path}", which declares precision ${String(field.precision)}, with "${compared.literal}", which is not at that width. ` +
            `A rule compares the two as text, so it orders them wrongly and no answer equals it. ` +
            `${REMEDY} At this field’s width the literal is written like "${temporalExample(field.type, field.precision)}".`,
    })
  }
  return found
}

/**
 * `opens != ""` is the usual way to ask whether a field was answered, and it is the wrong one:
 * an unanswered field holds null, so the rule is always true (0236). No width fixes it, so the
 * message gives the idiom that does, not the three remedies for a literal that meant a time.
 */
function emptyLiteralMessage(about: About, path: string, read: string, rowScope: string | undefined): string {
  return (
    `${ruleOf(about)} compares "${path}" with the empty text "". An unanswered field holds null, not "", so this does not ask whether it was answered. ` +
    `To ask that, write \`${answeredTest(read, rowScope)}\`.`
  )
}

/**
 * The test that asks whether a field was answered, on the read as the rule wrote it, so that it
 * can be copied into the rule: `item.at` in a row, never the model's `legs[].at`, which is no
 * expression. The logic guide's table is the reason for each case:
 *
 * - **Inside a group, `has()`.** Reading a member of a group nobody answered fails, and a rule
 *   that fails shows its field, so `!= null` there fails rather than answering.
 * - **At the top of the form, `!= null`.** `has()` takes only a member, so `has(opens)` does not
 *   compile.
 * - **In a row, `!= null`.** A row presents every key, so `has(item.at)` is always true.
 */
function answeredTest(read: string, rowScope: string | undefined): string {
  const inRow = rowScope !== undefined && read.startsWith(`${ROW_ITEM}.`)
  return !inRow && read.includes('.') && !read.includes('[') ? `has(${read})` : `${read} != null`
}

/** Two temporal fields compared, where either declares a precision and their shapes differ. */
function fieldProblems(ast: ExpressionAst, rowScope: string | undefined, fields: ReadonlyMap<string, TemporalField>, about: About): CrossWidthComparison[] {
  const found: CrossWidthComparison[] = []
  for (const compared of comparedFields(ast)) {
    const left = inModel(compared.left, rowScope)
    const right = inModel(compared.right, rowScope)
    const a = fields.get(left)
    const b = fields.get(right)
    if (a === undefined || b === undefined) continue
    if (a.precision === undefined && b.precision === undefined) continue
    if (temporalShape(a.type, a.precision) === temporalShape(b.type, b.precision)) continue
    found.push({
      ...about,
      paths: [left, right],
      message:
        `${ruleOf(about)} compares "${left}" with "${right}", whose answers are not written at one width (${widthOf(a)} and ${widthOf(b)}). ` +
        `A rule compares the two as text, so it orders them wrongly and no answer equals it. ${REMEDY}`,
    })
  }
  return found
}

/** A field's width, in a sentence: its type and, where declared, its precision. */
function widthOf(field: TemporalField): string {
  return field.precision === undefined ? `a ${field.type} with no precision` : `a ${field.type} of precision ${String(field.precision)}`
}
