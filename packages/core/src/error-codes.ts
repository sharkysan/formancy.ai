import type { FieldFormat } from '@formancy/spec'

/**
 * Every error code the engine reports of its own accord: the words a validation report
 * holds when no rule named one.
 *
 * A type and nothing else, so it costs the bundle nothing. What it buys is that the
 * list is somewhere. The codes were string literals pushed in two files, and a reader
 * wanting the vocabulary — a message catalogue, or a model asked to write an example
 * with its expected errors — had to read the validators to find it
 * ([0162](../../../docs/decisions/0162-an-example-is-drafted-from-what-the-author-said.md)).
 * `model-validators.ts` returns this type and `engine.ts` writes each literal it pushes
 * as `satisfies` it, so a code pushed that is not here does not compile; and
 * `@formancy/builder-core` holds a constant that satisfies `Record<BuiltInErrorCode,
 * true>`, so a code added here does not compile there until the vocabulary it tells a
 * model has it too.
 *
 * Not here: a `validate` rule's own `code`, or the string a rule evaluates to, which are
 * the author's words; and a deployment's check verdicts, which are the deployment's.
 */
export type BuiltInErrorCode =
  // Asked for and not answered — `required`, or a rule that requires it now.
  | 'required'
  // A `validate` rule that names no code of its own, and one that cannot evaluate.
  | 'invalid'
  // A `check` rule whose check this deployment does not supply, or which failed to answer.
  | 'check_unavailable'
  // An answer of a shape no control produces: a scalar where a list belongs, and the like.
  | 'type'
  // Not one of the options offered; a ranking that names one twice; a matrix row not asked.
  | 'option'
  | 'duplicate'
  | 'row'
  // Numbers.
  | 'min'
  | 'max'
  | 'step'
  // Text.
  | 'minLength'
  | 'maxLength'
  | 'pattern'
  | 'mask'
  | FieldFormat
  // Dates and times: an answer not in the type's one shape, and the bounds.
  | 'shape'
  | 'earliest'
  | 'latest'
  // Lists and files.
  | 'minItems'
  | 'maxItems'
  | 'maxFileSize'
  | 'accept'
  // Signatures.
  | 'box'
  | 'maxPoints'

/**
 * What `validate()` answers: whether the form passes, and the codes per path that say
 * why not.
 *
 * Beside the vocabulary rather than in `engine.ts`, which has no room to grow, because a
 * report is where these codes are read. Its codes stay `string`: a `validate` rule's own
 * code is the author's word, and it is in the same list.
 */
export interface ValidationReport {
  valid: boolean
  errors: Record<string, string[]>
}
