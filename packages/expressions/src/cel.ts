/**
 * The ONLY module in the repository that may import the CEL implementation.
 *
 * `@marcbachmann/cel-js` is MIT, zero-dependency and fast, but it has one
 * maintainer. Keeping every reference to it behind this file means swapping in
 * `@bufbuild/cel` or a fork is a one-file change rather than a migration.
 */
import {
  Environment,
  ParseError,
  EvaluationError,
  TypeError as CelTypeError,
} from '@marcbachmann/cel-js'
import { childNodes } from './ast.js'
import type { CelNode } from './ast.js'
import type { Meter } from './budget.js'
import type { Capabilities } from './capabilities.js'
import {
  Decimal,
  addDecimal,
  compareDecimal,
  decimalFromString,
  decimalToString,
  divideDecimal,
  multiplyDecimal,
  negateDecimal,
  roundDecimal,
  subtractDecimal,
} from './decimal.js'
import { ExpressionError } from './errors.js'
import type { ExpressionErrorKind, SourceSpan } from './errors.js'
import { parserLimits } from './limits.js'
import type { StructuralLimits } from './limits.js'
import type { DeclaredType, ResultType, VariableDeclarations } from './types.js'
import { timestampToString } from './values.js'

/** One evaluation pass: its frozen capabilities and its share of the budget. */
export interface EvaluationPass {
  readonly capabilities: Capabilities
  readonly meter: Meter
}

/** A parsed, reusable program. Parsing is the expensive step; evaluation is hot. */
export interface CelProgram {
  readonly node: CelNode
  check(): CelCheckOutcome
  run(values: Record<string, unknown>, pass: EvaluationPass): unknown
}

export type CelCheckOutcome =
  | { readonly valid: true; readonly type: ResultType }
  | { readonly valid: false; readonly error: unknown }

export interface CelRuntime {
  parse(source: string): CelProgram
}

export interface RuntimeSpec {
  readonly limits: StructuralLimits
  /**
   * When omitted every identifier is `dyn`, which is what a caller wants for
   * `referencedPaths` on an expression it has no schema for. When present,
   * undeclared identifiers are a type error.
   */
  readonly variables?: VariableDeclarations | undefined
}

/**
 * CEL's own spelling of our declared types. `google.protobuf.*` is the CEL
 * spec's name for these, not a protobuf dependency.
 */
const CEL_TYPE_NAMES: Readonly<Record<DeclaredType, string>> = Object.freeze({
  bool: 'bool',
  int: 'int',
  double: 'double',
  decimal: 'decimal',
  string: 'string',
  timestamp: 'google.protobuf.Timestamp',
  list: 'list<dyn>',
  map: 'map<dyn, dyn>',
  dyn: 'dyn',
})

const RESULT_TYPE_NAMES: Readonly<Record<string, ResultType>> = Object.freeze({
  'google.protobuf.Timestamp': 'timestamp',
  'google.protobuf.Duration': 'duration',
  'list<dyn>': 'list',
  'map<dyn, dyn>': 'map',
})

export function createRuntime(spec: RuntimeSpec): CelRuntime {
  const environment = new Environment({
    unlistedVariablesAreDyn: spec.variables === undefined,
    limits: parserLimits(spec.limits),
  })

  /**
   * The pass a registered function belongs to. Evaluation is synchronous and
   * single-threaded, so a slot set for the duration of one call is enough to
   * give the handlers their capabilities without making them ambient.
   */
  let pass: EvaluationPass | undefined

  function current(name: string): EvaluationPass {
    if (pass === undefined) throw new Error(`${name}() was called outside an evaluation pass`)
    pass.meter.charge()
    return pass
  }

  registerDecimal(environment, current)
  registerCapabilityFunctions(environment, current)
  registerMetering(environment, current)

  if (spec.variables !== undefined) {
    for (const [name, type] of Object.entries(spec.variables)) {
      environment.registerVariable(name, CEL_TYPE_NAMES[type])
    }
  }

  return {
    parse(source) {
      const parsed = environment.parse(source)
      instrumentForMetering(parsed.ast as unknown as SurgicalNode, environment)
      return {
        node: parsed.ast as unknown as CelNode,
        check() {
          const result = parsed.check()
          if (!result.valid) return { valid: false, error: result.error }
          const name = result.type ?? 'dyn'
          return { valid: true, type: RESULT_TYPE_NAMES[name] ?? (name as ResultType) }
        },
        run(values, evaluationPass) {
          pass = evaluationPass
          try {
            return parsed(values)
          } finally {
            pass = undefined
          }
        },
      }
    },
  }
}

type PassAccessor = (name: string) => EvaluationPass

/** What a runtime value is, in words a form author uses, for error messages. */
function runtimeTypeName(value: unknown): string {
  if (value === null) return 'null'
  if (value instanceof Date) return 'timestamp'
  if (Array.isArray(value)) return 'list'
  return typeof value === 'object' ? 'map' : typeof value
}

/**
 * Registers `decimal` as a first-class CEL type with no implicit conversion to
 * or from `double`. The absence of a `decimal * double` overload is the whole
 * point: it turns `price * 0.19` into a check-time error.
 */
function registerDecimal(environment: Environment, current: PassAccessor): void {
  environment.registerType('decimal', { ctor: Decimal, fields: {} })

  environment.registerFunction('dec(string): decimal', (text: string) => {
    current('dec')
    return decimalFromString(text)
  })
  // The int form is the sanctioned way to bring a counted quantity into money
  // arithmetic: `dec(quantity) * price` rather than an implicit widening.
  environment.registerFunction('dec(int): decimal', (units: bigint) => {
    current('dec')
    return new Decimal(units, 0)
  })
  environment.registerFunction('round(decimal, int): decimal', (value: Decimal, places: bigint) => {
    current('round')
    return roundDecimal(value, Number(places))
  })
  // There is no `/` for decimals: division does not stay exact, so the number
  // of places is the author's decision and has to be written down.
  environment.registerFunction(
    'divide(decimal, decimal, int): decimal',
    (a: Decimal, b: Decimal, places: bigint) => {
      current('divide')
      return divideDecimal(a, b, Number(places))
    },
  )
  environment.registerFunction('string(decimal): string', (value: Decimal) => {
    current('string')
    return decimalToString(value)
  })

  environment.registerOperator('decimal + decimal', addDecimal)
  environment.registerOperator('decimal - decimal', subtractDecimal)
  environment.registerOperator('decimal * decimal', multiplyDecimal)
  environment.registerOperator('-decimal', negateDecimal)
  environment.registerOperator('decimal == decimal', (a: Decimal, b: Decimal) => {
    return compareDecimal(a, b) === 0
  })
  // A decimal beside a string, double or int must not fall through to the
  // implementation's universal cross-type equality: that fallback answers
  // `false` for a decimal next to its own written form — silently wrong for
  // exactly the values people compare money against. These overloads make the
  // meeting a loud error instead. (`decimal == dyn` cannot be used here: it
  // makes runtime dispatch of decimal == decimal through dyn slots ambiguous.)
  for (const otherType of ['string', 'double', 'int']) {
    environment.registerOperator(`decimal == ${otherType}`, (a: unknown, b: unknown) => {
      const other = a instanceof Decimal ? b : a
      throw new RangeError(
        `A decimal can only be compared to another decimal, not to a ${runtimeTypeName(other)}; ` +
          'convert the other side with dec() first',
      )
    })
  }
  // `!=` is derived from `==` by the implementation; registering it is an error.
  environment.registerOperator('decimal < decimal', (a: Decimal, b: Decimal) => {
    return compareDecimal(a, b) < 0
  })
  environment.registerOperator('decimal <= decimal', (a: Decimal, b: Decimal) => {
    return compareDecimal(a, b) <= 0
  })
  environment.registerOperator('decimal > decimal', (a: Decimal, b: Decimal) => {
    return compareDecimal(a, b) > 0
  })
  environment.registerOperator('decimal >= decimal', (a: Decimal, b: Decimal) => {
    return compareDecimal(a, b) >= 0
  })
}

/**
 * The internal metering pass-throughs, `T -> T` so they are invisible to the
 * type checker. Their names never appear in an author's expression: the policy
 * allow-list rejects them at check time, and the only call sites are the ones
 * `instrumentForMetering` splices in.
 */
const STEP_FUNCTION = '__it'
const SIZE_FUNCTION = '__sz'

/**
 * One step buys this many characters of internal string production. Charging
 * per character would make ordinary concatenation absurdly expensive against a
 * 20k budget; charging per string would make length free. Sixty-four keeps a
 * legal 16 KiB field worth a few hundred steps.
 */
const STRING_CHUNK = 64

/** Steps a produced value costs beyond the call itself, by its SIZE. */
function sizeCost(value: unknown): number {
  if (typeof value === 'string') return Math.floor(value.length / STRING_CHUNK)
  if (Array.isArray(value)) return value.length
  if (value instanceof Map) return value.size
  if (typeof value === 'object' && value !== null) {
    const prototype = Object.getPrototypeOf(value) as object | null
    if (prototype === Object.prototype || prototype === null) return Object.keys(value).length
  }
  return 0
}

/**
 * The step meter charges reads of the value bag, which leaves everything an
 * expression produces INTERNALLY free: `s.split("")` mints a list as long as
 * the field, and a comprehension walks it without spending a step. These two
 * functions are the counter for that side: `__it` marks one comprehension
 * iteration, `__sz` prices a value by the size it was just produced or
 * consumed at. Both count deterministically, so a submission that passed in
 * the browser replays identically on the server.
 */
function registerMetering(environment: Environment, current: PassAccessor): void {
  environment.registerFunction(`${STEP_FUNCTION}(T): T`, (value: unknown) => {
    current(STEP_FUNCTION)
    return value
  })
  environment.registerFunction(`${SIZE_FUNCTION}(T): T`, (value: unknown) => {
    current(SIZE_FUNCTION).meter.charge(sizeCost(value))
    return value
  })
}

/**
 * The mutable face of a parsed node, used only by the instrumentation below.
 *
 * `meta` is where the implementation caches a node's behaviour: `alternate` is
 * the tree a macro expanded to at parse time (check and evaluation follow it
 * instead of the visible node), and `check`/`evaluate` are the node's own
 * operator functions. Everything here is public API of the node object, just
 * not of the package's typings.
 */
interface SurgicalNode {
  readonly op: string
  readonly args: unknown
  readonly meta: {
    alternate?: SurgicalNode
    macro?: unknown
    check: unknown
    evaluate: unknown
  }
  clone(op: OperatorHandle, args: unknown): SurgicalNode
  setMeta(key: string, value: unknown): SurgicalNode
}

interface OperatorHandle {
  readonly name: string
  readonly check: unknown
  readonly evaluate: unknown
}

/** The comprehension expansion's payload; a plain mutable object. */
interface ComprehensionArgs {
  iterable: SurgicalNode
  step: SurgicalNode
}

/** The calls whose RESULT size an expression can inflate internally. */
const SIZE_METERED_CALLS: ReadonlySet<string> = new Set(['split', 'join'])

/**
 * The calls that walk their whole RECEIVER on every evaluation. Inside a
 * comprehension each of them rescans per iteration, so the receiver's size is
 * the real per-iteration cost and gets charged as such. The calendar getters
 * and conversions are absent on purpose: their receivers are scalar.
 */
const RECEIVER_METERED_CALLS: ReadonlySet<string> = new Set([
  'contains',
  'startsWith',
  'endsWith',
  'matches',
  'indexOf',
  'lastIndexOf',
  'substring',
  'lowerAscii',
  'upperAscii',
  'trim',
  'size',
  'split',
  'join',
])

/**
 * Splice the metering calls into a freshly parsed tree, before its first check.
 *
 * Comprehension macros expand at PARSE time into a `comprehension` node stored
 * as the rcall's alternate, so the amplifying positions are reachable and
 * mutable: the STEP (runs once per iteration -> `__it`), the ITERABLE (its
 * size is the iteration count -> `__sz`), plus `split`/`join` results and `+`
 * (the two ways to mint something big from something small). Wrappers are
 * clones carrying the wrapped node's source span, so every error still points
 * at what the author wrote; walkers over `node.args` (policy allow-list,
 * referencedPaths) never see them because they live in `meta.alternate` and in
 * the expansion, not in the visible tree.
 */
function instrumentForMetering(root: SurgicalNode, environment: Environment): void {
  // A genuine call node to steal the `call` operator functions from: nodes can
  // only be built through clone(), and the operator table is not exported.
  const template = environment.parse(`${STEP_FUNCTION}(true)`).ast as unknown as SurgicalNode
  const callOp: OperatorHandle = {
    name: 'call',
    check: template.meta.check,
    evaluate: template.meta.evaluate,
  }
  const wrapCall = (name: string, inner: SurgicalNode): SurgicalNode =>
    inner.clone(callOp, [name, [inner]])

  /** Nodes some wrapper already prices, so a second one would double-charge. */
  const sizeCharged = new Set<SurgicalNode>()

  /**
   * Redirect `node` through a metering call without touching its parent: the
   * wrapper becomes the node's alternate and the node's own behaviour moves
   * into a clone. Parents, captured macro expansions and AST walkers keep
   * their references; only check and evaluation follow the detour.
   */
  function wrapInPlace(node: SurgicalNode): void {
    if (sizeCharged.has(node)) return
    // A macro object reads its arguments positionally rather than as
    // expressions; nothing wrapped here is one, but a guard beats a corrupted
    // tree if the implementation ever grows a macro named like these calls.
    if (node.meta.macro !== undefined) return
    sizeCharged.add(node)
    const inner =
      node.meta.alternate ??
      node.clone({ name: node.op, check: node.meta.check, evaluate: node.meta.evaluate }, node.args)
    node.setMeta('alternate', wrapCall(SIZE_FUNCTION, inner))
  }

  /**
   * First pass: comprehensions. It must run to completion before any
   * `wrapInPlace`, because that mutation swaps a node's alternate for a call
   * wrapper and would hide the `comprehension` this pass is looking for.
   */
  function walkComprehensions(node: SurgicalNode): void {
    if (node.op === 'rcall') {
      const alternate = node.meta.alternate
      if (alternate !== undefined && alternate.op === 'comprehension') {
        const args = alternate.args as ComprehensionArgs
        args.step = wrapCall(STEP_FUNCTION, args.step)
        sizeCharged.add(args.iterable)
        args.iterable = wrapCall(SIZE_FUNCTION, args.iterable)
      }
    }
    for (const child of childNodes(node as unknown as CelNode)) {
      walkComprehensions(child as unknown as SurgicalNode)
    }
  }

  /** Second pass: everything that produces or rescans by size. */
  function walkProducers(node: SurgicalNode): void {
    if (node.op === 'rcall') {
      const [name, receiver] = node.args as [string, SurgicalNode, ...unknown[]]
      if (SIZE_METERED_CALLS.has(name)) wrapInPlace(node)
      if (RECEIVER_METERED_CALLS.has(name) && receiver !== undefined) wrapInPlace(receiver)
    } else if (node.op === '+') {
      wrapInPlace(node)
    }
    for (const child of childNodes(node as unknown as CelNode)) {
      walkProducers(child as unknown as SurgicalNode)
    }
  }

  walkComprehensions(root)
  walkProducers(root)
}

/**
 * The three impure functions a form may call. They exist in the environment so
 * that an expression using them type-checks, but every one of them reads the
 * frozen pass rather than any ambient source.
 */
function registerCapabilityFunctions(environment: Environment, current: PassAccessor): void {
  environment.registerFunction('now(): google.protobuf.Timestamp', () => {
    return new Date(current('now').capabilities.nowMs)
  })
  // Midnight UTC of the caller's civil date: a form compares dates, and the
  // zone that date was decided in is the caller's business, not ours.
  environment.registerFunction('today(): google.protobuf.Timestamp', () => {
    return new Date(`${current('today').capabilities.today}T00:00:00Z`)
  })
  environment.registerFunction('random(): double', () => {
    return current('random').capabilities.random
  })
  // CEL specifies string(timestamp) as RFC 3339; this implementation does not
  // have the overload, so we supply it rather than leave a hole in the surface.
  environment.registerFunction('string(google.protobuf.Timestamp): string', (date: Date) => {
    current('string')
    return timestampToString(date)
  })
}

/**
 * Turn whatever the CEL implementation threw into our own error.
 *
 * Its messages embed a multi-line source caret diagram, which is useful in a
 * terminal and noise in a form builder's error list, so only the summary is
 * kept and the span is reported separately.
 */
export function translateCelError(error: unknown, source: string): ExpressionError {
  if (error instanceof ExpressionError) return error

  const kind = celErrorKind(error)
  const code = readString(error, 'code') ?? 'cel_error'
  return new ExpressionError({
    kind,
    code,
    message: celErrorMessage(error),
    source,
    position: celErrorSpan(error),
    cause: error,
  })
}

function celErrorKind(error: unknown): ExpressionErrorKind {
  if (error instanceof ParseError) {
    return readString(error, 'code') === 'limit_exceeded' ? 'limit' : 'syntax'
  }
  if (error instanceof CelTypeError) return 'type'
  if (error instanceof EvaluationError) return 'runtime'
  return 'runtime'
}

function celErrorMessage(error: unknown): string {
  const summary = readString(error, 'summary')
  if (summary !== undefined && summary.length > 0) return summary
  const message = error instanceof Error ? error.message : String(error)
  return message.split('\n')[0] ?? message
}

function celErrorSpan(error: unknown): SourceSpan | undefined {
  const range = (error as { range?: { start?: unknown; end?: unknown } } | null)?.range
  if (typeof range?.start === 'number' && typeof range.end === 'number') {
    return { start: range.start, end: range.end }
  }
  const pos = (error as { node?: { pos?: unknown } } | null)?.node?.pos
  return typeof pos === 'number' ? { start: pos, end: pos } : undefined
}

function readString(value: unknown, key: string): string | undefined {
  const read = (value as Record<string, unknown> | null)?.[key]
  return typeof read === 'string' ? read : undefined
}
