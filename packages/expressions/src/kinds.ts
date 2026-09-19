/**
 * What an expression is FOR, and therefore what it is allowed to do.
 *
 * The allowed function set is a property of the kind rather than a global
 * switch: a `visible` expression decides whether a user sees a field, so it
 * must be pure and side-effect free even if a later version of this package
 * grows functions that are not. Making capability a property of the kind means
 * a new function is unavailable everywhere until someone adds it to a kind on
 * purpose.
 */
export type ExpressionKind = 'visible' | 'disabled' | 'required' | 'computed' | 'validate'

export const EXPRESSION_KINDS: readonly ExpressionKind[] = Object.freeze([
  'visible',
  'disabled',
  'required',
  'computed',
  'validate',
])

/**
 * Functions every kind may call. All of them are pure, total and bounded by
 * the structural limits: none reads a clock, a random source, the network or
 * anything else outside the value bag it is handed.
 */
const READ_ONLY_CORE: readonly string[] = [
  // Collections and presence.
  'size',
  'has',
  'all',
  'exists',
  'exists_one',
  'filter',
  'map',
  // Strings.
  'startsWith',
  'endsWith',
  'contains',
  'matches',
  'lowerAscii',
  'upperAscii',
  'trim',
  'indexOf',
  'lastIndexOf',
  'substring',
  'split',
  'join',
  // Conversions.
  'bool',
  'int',
  'double',
  'string',
  'dyn',
  'type',
  'timestamp',
  'duration',
  // Calendar arithmetic on a value that was handed in, not on the current time.
  'getFullYear',
  'getMonth',
  'getDayOfMonth',
  'getDayOfYear',
  'getDayOfWeek',
  'getDate',
  'getHours',
  'getMinutes',
  'getSeconds',
  'getMilliseconds',
  // Exact decimal money.
  'dec',
  'round',
  'divide',
]

/**
 * The clock. Injected, frozen per evaluation pass and therefore replayable, so
 * it is safe in a condition; see `capabilities.ts`.
 */
const CLOCK: readonly string[] = ['now', 'today']

/**
 * Randomness. Allowed only where the result is stored with the submission.
 * A `visible` or `required` expression that flips on a coin toss would make a
 * form's behaviour unreproducible for support and unverifiable on the server.
 */
const RANDOM: readonly string[] = ['random']

export interface KindPolicy {
  readonly allowedFunctions: ReadonlySet<string>
  /**
   * The result types this kind accepts, or `any` for a computed value, which
   * is whatever the field it feeds is declared to hold.
   */
  readonly resultTypes: ReadonlySet<string> | 'any'
}

function policy(
  functions: readonly (readonly string[])[],
  resultTypes: ReadonlySet<string> | 'any',
): KindPolicy {
  return Object.freeze({
    allowedFunctions: new Set(functions.flat()),
    resultTypes,
  })
}

const BOOLEAN = new Set(['bool'])
/**
 * A validation expression answers "is this acceptable": `false` or a non-empty
 * string both mean no, and the string is the message shown to the user.
 */
const BOOLEAN_OR_MESSAGE = new Set(['bool', 'string'])

export const KIND_POLICIES: Readonly<Record<ExpressionKind, KindPolicy>> = Object.freeze({
  visible: policy([READ_ONLY_CORE, CLOCK], BOOLEAN),
  disabled: policy([READ_ONLY_CORE, CLOCK], BOOLEAN),
  required: policy([READ_ONLY_CORE, CLOCK], BOOLEAN),
  validate: policy([READ_ONLY_CORE, CLOCK], BOOLEAN_OR_MESSAGE),
  computed: policy([READ_ONLY_CORE, CLOCK, RANDOM], 'any'),
})
