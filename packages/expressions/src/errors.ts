/**
 * The one error type this package ever throws or returns.
 *
 * The underlying CEL implementation is an implementation detail we intend to be
 * able to swap (see the note in `cel.ts`), so a raw `ParseError`,
 * `TypeError` or `EvaluationError` from it must never reach a caller: consumers
 * would start pattern-matching on messages we do not control.
 */

/**
 * Where in the lifecycle the expression was rejected. Callers surface `syntax`,
 * `type`, `limit` and `policy` to the form author while they are editing, and
 * treat `runtime` and `budget` as a failure of one evaluation pass.
 */
export type ExpressionErrorKind = 'syntax' | 'type' | 'limit' | 'policy' | 'runtime' | 'budget'

/** A half-open character range into the expression source. */
export interface SourceSpan {
  readonly start: number
  readonly end: number
}

export interface ExpressionErrorInit {
  readonly kind: ExpressionErrorKind
  /** Stable machine-readable discriminator, e.g. `unexpected_token`. */
  readonly code: string
  /** A sentence a form author can act on, without CEL jargon where avoidable. */
  readonly message: string
  readonly source: string
  readonly position?: SourceSpan | undefined
  /** A concrete suggestion, e.g. how to write the expression the allowed way. */
  readonly hint?: string | undefined
  readonly cause?: unknown
}

/**
 * The same error with a suggestion attached. Errors are frozen value objects,
 * so enriching one produces a new one rather than mutating the original.
 */
export function withHint(error: ExpressionError, hint: string): ExpressionError {
  return new ExpressionError({
    kind: error.kind,
    code: error.code,
    message: error.message,
    source: error.source,
    position: error.position,
    hint,
    cause: error.cause,
  })
}

export class ExpressionError extends Error {
  override readonly name = 'ExpressionError'
  readonly kind: ExpressionErrorKind
  readonly code: string
  readonly source: string
  /** Undefined when the failure cannot be attributed to a span, e.g. a budget. */
  readonly position: SourceSpan | undefined
  readonly hint: string | undefined

  constructor(init: ExpressionErrorInit) {
    // `cause` is only set when there is one: passing `{cause: undefined}` still
    // defines the property, which makes error snapshots differ for no reason.
    super(init.message, init.cause === undefined ? undefined : { cause: init.cause })
    this.kind = init.kind
    this.code = init.code
    this.source = init.source
    this.position = init.position
    this.hint = init.hint
  }
}
