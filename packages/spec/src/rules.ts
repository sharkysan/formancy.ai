/**
 * How a form behaves: its rules — which kinds exist, at which spec version each
 * arrived, and what one says.
 *
 * Out of `types.ts` for the reason the layout vocabulary left it
 * (`layout.ts`): the rules change for their own reasons — a new kind, a richer
 * condition — and not when what a field collects does. It left when spec 4 put
 * an option's image on a file at its size ceiling. Only types cross back, so
 * there is no cycle.
 */

/** The form's behaviour, apart from its data model. */
export interface FormLogic {
  rules: LogicRule[]
}

/**
 * The rule kinds version 2 has, all of them one CEL expression.
 *
 * Named so a later kind can be gated by version. A reader on version 2 given a
 * kind it has never heard of has no safe answer: ignoring the rule renders a form
 * that behaves differently from the one the author built, and guessing is worse.
 */
export const SPEC_2_RULE_KINDS = [
  'visible',
  'disabled',
  'required',
  'computed',
  'validate',
] as const

/**
 * Every rule kind, including `check` — a validator the deployment answers.
 *
 * `check` is a KIND rather than a flag on `validate`, which
 * [0042](../../../docs/decisions/0042-freeze-the-spec.md) settled before it was
 * built: a CEL expression is pure and synchronous by construction, which is what
 * makes the dependency graph derivable and the evaluation bounded, so an
 * asynchronous validator cannot be an expression with a property on it.
 */
export const RULE_KINDS = [...SPEC_2_RULE_KINDS, 'check', 'skip'] as const

/**
 * Rule kinds whose `target` is a PAGE KEY rather than a data path.
 *
 * Exactly one, and it is worth naming rather than testing for the kind at each
 * use: a page is transparent for data and therefore has no data path at all, so
 * every walk that resolves a target has to know which of the two it is holding.
 */
export const PAGE_TARGETED_RULE_KINDS = ['skip'] as const

export type RuleKind = (typeof RULE_KINDS)[number]

/** Where a validation rule runs. */
export type RunsOn = 'both' | 'client' | 'server'

export interface LogicRule {
  /** Data path of the field the rule applies to, e.g. `address.city` or `items[].qty`. */
  target: string
  kind: RuleKind
  /**
   * The rule, in CEL. The single source of truth for evaluation.
   *
   * Absent on a `check`, which has no expression: it names a validator the
   * deployment answers, and a rule carrying both would be two rules in one object
   * with no answer to which verdict wins.
   */
  cel?: string
  /** validate only: the error code the field carries while the check fails. */
  code?: string
  /**
   * Where this rule runs.
   *
   * **The default is not one value.** A `validate` rule with none falls back to
   * `both`; a `check` falls back to `server`, because only the server can always
   * answer one — a browser can ask only if its host supplied a checker, so a
   * check defaulting to `both` would fail closed on every page nobody had wired
   * up. A host that can answer in the browser says `both`, and until it does the
   * check runs at submit and nowhere else
   * ([0090](../../../docs/decisions/0090-a-check-defaults-to-the-server.md)).
   * Measured: written the obvious way, with no `runsOn`, a check never ran in the
   * browser and nothing reported it.
   *
   * Some checks cannot run in both places — a uniqueness check needs the
   * database, a debounced hint needs the keyboard — and without a way to say
   * so, an author writes the check twice and the two copies drift.
   *
   * Metadata rules deliberately cannot carry this. If visibility or
   * requiredness could differ between client and server, the server's replay
   * would stop being a check and become a second opinion.
   */
  runsOn?: RunsOn
  /**
   * check only: the NAME of a validator the deployment answers.
   *
   * **A name and never an address**, for the three reasons `optionsSource` gives:
   * a URL here would be a deployment detail in a portable format, frozen forever
   * in a published version, and an SSRF surface on an instance inside a private
   * network. The document says *which* check; the deployment says how to answer
   * it, and nothing in `@formancy/spec` or `@formancy/core` fetches anything
   * ([0086](../../../docs/decisions/0086-a-check-is-named-and-answered-elsewhere.md)).
   */
  check?: string
  /** Regenerated visual-editor metadata. Never evaluated. */
  editor?: unknown
}
