import { TEMPORAL_PRECISION_MAX, temporalDateExists, temporalExample, temporalShapeRegExp } from './temporal.js'
import { schemaError } from './schema-errors.js'
import type { SchemaError } from './schema-errors.js'
import type { FieldDef, TemporalFieldType } from './types.js'

const TEMPORAL_TYPES: readonly string[] = ['date', 'time', 'datetime']

/**
 * A bound written at a width other than its field's, or on a field with a precision, on a day
 * the calendar does not have.
 *
 * The schema cannot see a field's `precision` from inside a bound, so it lets a bound be
 * written at any width the type has; this is the check that holds it to the one width its
 * field answers in. Bounds are compared as text, which is chronological only when both
 * sides have the same width, so a bound at another width is a comparison that quietly
 * orders wrongly rather than one that fails.
 *
 * A precision the schema refused is skipped: the shape functions throw outside 0..9, and
 * the structural error already says what is wrong with the field.
 */
export function temporalBoundErrors(field: FieldDef, path: string): SchemaError[] {
  if (!TEMPORAL_TYPES.includes(field.type)) return []
  const type = field.type as TemporalFieldType
  const { precision } = field
  if (precision !== undefined && (!Number.isInteger(precision) || precision < 0 || precision > TEMPORAL_PRECISION_MAX)) return []

  const shape = temporalShapeRegExp(type, precision)
  const expected = temporalExample(type, precision)
  const errors: SchemaError[] = []
  for (const bound of ['earliest', 'latest'] as const) {
    const value = field[bound]
    if (value === undefined) continue
    if (!shape.test(value)) errors.push(schemaError(`${path}/${bound}`, 'bounds.width', { expected }))
    // As the engine checks an answer: a field with a precision refuses a day the calendar does
    // not have, so a bound on one is no answer it could have. One without is 0.13.0's, unchanged.
    else if (precision !== undefined && !temporalDateExists(type, value)) errors.push(schemaError(`${path}/${bound}`, 'bounds.noSuchDay', { bound: value }))
  }
  return errors
}
