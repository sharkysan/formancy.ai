/**
 * The types a form field can be declared as for expression checking.
 *
 * Deliberately smaller than CEL's type system: a form model has no unsigned
 * integers and no byte strings, and offering them would mean supporting the
 * overload explosion they bring. Element types of `list` and `map` are `dyn` —
 * a repeater's rows are heterogeneous by construction.
 *
 * `decimal` is ours, not CEL's. See `decimal.ts` for why money cannot be a
 * `double`. A duration is not declarable either: JSON has no way to write one,
 * so it can only be produced inside an expression by `duration("1h")`.
 */
export type DeclaredType =
  | 'bool'
  | 'int'
  | 'double'
  | 'decimal'
  | 'string'
  | 'timestamp'
  | 'list'
  | 'map'
  /** Use for a field that may be absent or null; CEL has no nullable scalars. */
  | 'dyn'

/**
 * A variable declared by member: each member with its own type, or declared by member itself
 * (0231). `row: { amount: 'decimal', copies: 'int' }` checks `row.amount` as a decimal, refuses a
 * member it does not name, and refuses `row` read whole, which would hand its members on as `dyn`.
 */
export interface MemberDeclarations {
  readonly [member: string]: DeclaredType | MemberDeclarations
}

/** The variables an expression may read, by name, each with its declared type or its members'. */
export type VariableDeclarations = Readonly<Record<string, DeclaredType | MemberDeclarations>>

/**
 * The type an expression produced, as reported by `check`. Wider than
 * `DeclaredType`: an expression can produce a duration or a null that no field
 * can be declared as.
 */
export type ResultType = DeclaredType | 'duration' | 'null' | 'type' | 'error'
