import { Decimal, compareDecimal, decimalFromString, decimalToString } from '@formancy/expressions'
import { ANSWER_KINDS, fitsAnswerShape, modelDataFields } from '@formancy/spec'
import type { FieldDef, FormModel } from '@formancy/spec'

/**
 * What a computed rule's result is stored as in the field it fills — or `undefined`, and
 * then nothing is written, exactly as when the expression cannot be evaluated (0054).
 *
 * **Only in the field's own shape** (0189). A rule's result can be any type, and before
 * this one was stored whatever it was: `42.0` computed into a text field stored a number,
 * and the replay accepted it, because a computed field is the engine's and nobody types
 * over it. A wrong shape is the author's mistake and refusing the submission would make
 * it the respondent's, who cannot type over a computed field to fix it — so the value is
 * not written, the field stays empty, and a `required` on it says so.
 *
 * **A decimal into a number field is stored as the number it writes**, when one does.
 * `dec("19.90") * dec("2")` is the documented way to add up money, and a `Decimal` held
 * as-is made the form's value impossible to serialise: its units are a `bigint`. A double
 * holds every decimal of up to fifteen significant digits exactly, as the shortest number
 * that prints the same; one it cannot hold is not written rather than rounded, because a
 * total off by a cent is the reason the decimal type exists.
 */
export function storableResult(def: FieldDef, result: unknown): { value: unknown } | undefined {
  const kind = ANSWER_KINDS[def.type]
  if (result instanceof Decimal) {
    return kind.shape === 'number' ? exactNumber(result) : undefined
  }
  if (result === null) return kind.nullable ? { value: null } : undefined
  return fitsAnswerShape(kind.shape, result) ? { value: result } : undefined
}

function exactNumber(decimal: Decimal): { value: number } | undefined {
  // Parsed from its written form, which rounds correctly; arithmetic on the units would not.
  const number = Number(decimalToString(decimal))
  const written = String(number)
  // An exponent is a magnitude no form total reaches, and `decimalFromString` reads none.
  if (!Number.isFinite(number) || /e/i.test(written)) return undefined
  return compareDecimal(decimalFromString(written), decimal) === 0 ? { value: number } : undefined
}

/** For one form: `storableResult` for the field a computed rule's target names (`items[].total`). */
export function computedWriter(model: FormModel): (target: string, result: unknown) => { value: unknown } | undefined {
  const defs = new Map(modelDataFields(model).map(({ path, def }) => [path, def]))
  return (target, result) => {
    const def = defs.get(target)
    // `validateSchema` refuses a rule aimed at no field; an engine handed one anyway
    // writes as it always did.
    return def === undefined ? { value: result } : storableResult(def, result)
  }
}
