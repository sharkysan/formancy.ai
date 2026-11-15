import { comparedLiterals, parse } from '@formancy/expressions'
import { TEMPORAL_FIELD_TYPES, TEMPORAL_SHAPES, modelDataFields } from '@formancy/spec'
import type { FieldType, FormSchema, LogicRule, TemporalFieldType } from '@formancy/spec'
import { inModel, rowScopeOf } from './unknown-paths.js'

/**
 * Rules that compare a date, a time or a date and time with text not written as its answers are.
 *
 * **Why it is a defect.** CEL has no date type, so a rule compares a temporal answer as text,
 * and text orders the way time does only between strings of the one fixed shape every answer
 * has (0067). `"2026-1-5"` sorts after `"2026-10-01"`, `"9:30"` after `"10:00"`, and
 * `"2026-10-08T10:30"` before the instant `"2026-10-08T10:30:00Z"`, which no answer of
 * twenty characters can equal. So such a rule holds at the wrong moment, and one using `==`
 * holds for nobody. Every gate passes it: the expression type-checks, and it decides something
 * for every answer.
 *
 * **Why it matters now.** The condition editor wrote the author's local wall clock for every
 * date and time through 0.13.0 (0235), and those rules are in published versions. Nothing
 * recorded the author's zone, so nothing can convert one. This at least names each one.
 *
 * **It reports; it does not refuse**, for the reason [0097](../../../docs/decisions/0097-a-publish-may-warn.md)
 * gives for a rule reading a path no field has: refusing would make documents valid today
 * invalid tomorrow, and what a reader accepts is the frozen version contract (0236).
 *
 * Only a literal compared directly with the field is seen. One built by a function, or passed
 * through `timestamp()`, is the evaluator's to judge, and a comparison of two fields is beyond
 * what a literal can say.
 */
export interface MisshapenTemporalLiteral {
  /** The rule's target, as written. */
  target: string
  kind: LogicRule['kind']
  cel: string
  /** The field compared, as the model writes it: `legs[].at` for `item.at` in a row of `legs`. */
  path: string
  type: TemporalFieldType
  literal: string
  /** What the author has to change, in their words. */
  message: string
}

const SHAPES: Readonly<Record<TemporalFieldType, RegExp>> = {
  date: new RegExp(TEMPORAL_SHAPES.date),
  time: new RegExp(TEMPORAL_SHAPES.time),
  datetime: new RegExp(TEMPORAL_SHAPES.datetime),
}

/** Each type's answers, as a sentence says them, with an example in the shape. */
const WRITTEN: Readonly<Record<TemporalFieldType, string>> = {
  date: 'a date, whose answers are written "YYYY-MM-DD", like "2026-10-08"',
  time: 'a time of day, whose answers are written "HH:MM" on a 24-hour clock, like "09:30"',
  datetime: 'a date and time, whose answers are written "YYYY-MM-DDTHH:MM:SSZ" in UTC, like "2026-10-08T08:30:00Z"',
}

/** What to do about it. A date and time without its `Z` is most likely the editor's old literal. */
const REMEDY: Readonly<Record<TemporalFieldType, string>> = {
  date: 'Write the literal as the answers are written.',
  time: 'Write the literal as the answers are written.',
  datetime:
    'The condition editor wrote a local time with no zone like this through 0.13.0: remove the rule and add it again in the editor, which writes the instant, or write the instant in UTC yourself.',
}

function isTemporal(type: FieldType): type is TemporalFieldType {
  return (TEMPORAL_FIELD_TYPES as readonly FieldType[]).includes(type)
}

export function misshapenTemporalLiterals(schema: FormSchema): MisshapenTemporalLiteral[] {
  const rules = schema.logic?.rules ?? []
  if (rules.length === 0) return []

  const temporal = new Map<string, TemporalFieldType>()
  for (const { path, def } of modelDataFields(schema.model)) {
    // A field that declares `precision` is not warned about: a literal at the wrong width
    // there is refused at publish (0237), and saying it twice helps nobody.
    if (isTemporal(def.type) && def.precision === undefined) temporal.set(path, def.type)
  }
  if (temporal.size === 0) return []

  const found: MisshapenTemporalLiteral[] = []
  for (const rule of rules) {
    // A check names a validator and carries no expression, and an expression that does not
    // parse is refused at publish already; saying so twice, in other words, helps nobody.
    if (rule.cel === undefined || rule.cel === '') continue
    const parsed = parse(rule.cel)
    if (!parsed.ok) continue

    const rowScope = rowScopeOf(rule.target)
    for (const compared of comparedLiterals(parsed.ast)) {
      const path = inModel(compared.path, rowScope)
      const type = temporal.get(path)
      if (type === undefined || SHAPES[type].test(compared.literal)) continue
      found.push({
        target: rule.target,
        kind: rule.kind,
        cel: rule.cel,
        path,
        type,
        literal: compared.literal,
        message:
          `Rule on "${rule.target}" (${rule.kind}) compares "${path}", ${WRITTEN[type]}, with "${compared.literal}", which is not written that way. ` +
          `A rule compares the two as text, so it orders them wrongly and no answer equals it. ${REMEDY[type]}`,
      })
    }
  }
  return found
}
