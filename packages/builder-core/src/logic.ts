import { resolveText } from '@formancy/spec'
import type { FormSchema, LogicRule, SpecVersion } from '@formancy/spec'
import type { Operator } from './conditions.js'
import { compileGroup } from './conditions.js'
import { groupOf, rowsOf } from './condition-draft.js'
import type { ConditionDraft, ConditionField } from './condition-draft.js'
import { BUILDER_MESSAGES } from './messages.js'
import type { BuilderText } from './messages.js'
import { dataPathOf, rulePathOf } from './navigate.js'
import { flatten } from './tree.js'

/**
 * What a rule can do, and where.
 *
 * `on` is the half that arrived with spec 3. A `skip` targets a PAGE and a page
 * has no data path, so the validator refuses every other kind on one — offering
 * them would be offering a choice refused every time, which is what the field
 * palette already learned about `page` itself. And a `check` is not a condition
 * at all: it names a validator the deployment answers, so the condition editor is
 * the wrong surface and is not shown for it.
 */
export interface RuleKindChoice {
  id: LogicRule['kind']
  label: string
  hint: string
  on: 'field' | 'page'
  /**
   * What the rule is written with, and there are three answers rather than two.
   *
   * A `condition` is composed in the comparison editor and compiled to CEL. A
   * `check` is a NAME the deployment answers and has no expression at all. An
   * `expression` is CEL that produces a VALUE rather than a boolean — the
   * comparison editor composes booleans, so it is the wrong surface for one, and
   * writing it as a box of CEL is the honest offer.
   *
   * It was a boolean, and `computed` was simply absent from this table: a kind
   * the format defines that no builder could write, which is the same
   * documented-but-unreachable shape `check` and `skip` shipped in. Found by
   * deriving the list from the spec rather than by reading it.
   */
  writes: 'condition' | 'check' | 'expression'
}

/**
 * The kinds a builder offers, with the words it offers them in.
 *
 * Here rather than in a builder because it is a decision rather than markup: two
 * copies would drift the first time the format grows a kind, one builder would
 * offer it and the other would not, and nobody using one of them could see the
 * difference ([0091](../../../docs/decisions/0091-a-second-builder-is-a-binding.md)).
 */
export const RULE_KIND_CHOICES: readonly RuleKindChoice[] = [
  kindChoice('visible', 'field', 'condition'),
  kindChoice('required', 'field', 'condition'),
  kindChoice('disabled', 'field', 'condition'),
  kindChoice('validate', 'field', 'condition'),
  kindChoice('check', 'field', 'check'),
  kindChoice('computed', 'field', 'expression'),
  kindChoice('skip', 'page', 'condition'),
]

/**
 * One kind, in English, with its words read from the catalogue.
 *
 * Read rather than written here, so there is one copy of the words and the
 * catalogue's German is a translation of what a builder actually shows. The
 * template-literal ids are checked by the compiler: a kind the format grows
 * without a `rule.<kind>.label` in the catalogue does not build. A builder
 * speaking another language reads `text(`rule.${id}.label`)` instead of
 * `label` ([0114](../../../docs/decisions/0114-the-builder-speaks-the-authors-language.md)).
 */
function kindChoice(id: LogicRule['kind'], on: RuleKindChoice['on'], writes: RuleKindChoice['writes']): RuleKindChoice {
  return {
    id,
    label: BUILDER_MESSAGES[`rule.${id}.label`],
    hint: BUILDER_MESSAGES[`rule.${id}.hint`],
    on,
    writes,
  }
}

/**
 * A kind's words in the session's language: what the select offers, what a listed
 * rule is called, and the sentence under it. `RULE_KIND_CHOICES` keeps its English
 * for callers that read it; both builders read these
 * ([0114](../../../docs/decisions/0114-the-builder-speaks-the-authors-language.md)).
 */
export function ruleKindLabel(kind: LogicRule['kind'], text: BuilderText): string {
  return text(`rule.${kind}.label`)
}

export function ruleKindHint(kind: LogicRule['kind'], text: BuilderText): string {
  return text(`rule.${kind}.hint`)
}

/** A comparison's words in the session's language. `OPERATORS` keeps its English. */
export function operatorLabel(id: Operator, text: BuilderText): string {
  return text(`operator.${id}`)
}

/**
 * "Field", or "Field 2" once there is more than one comparison: a number on a
 * single one is a number somebody has to wonder about. Both panels numbered their
 * rows this way by hand.
 */
export function comparisonLabel(part: 'field' | 'comparison' | 'value', at: number, count: number, text: BuilderText): string {
  return count > 1 ? text(`logic.${part}.numbered`, { number: at + 1 }) : text(`logic.${part}`)
}

/** The kinds that may be written on this node, and nothing that would be refused. */
export function ruleKindsFor(on: 'field' | 'page'): RuleKindChoice[] {
  return RULE_KIND_CHOICES.filter((choice) => choice.on === on)
}

/** What a kind is written with: a condition, a check's name, or an expression. */
export function kindWrites(kind: LogicRule['kind']): RuleKindChoice['writes'] {
  return RULE_KIND_CHOICES.find((choice) => choice.id === kind)?.writes ?? 'condition'
}

/** Whether a kind is composed in the comparison editor. */
export function kindCarriesCondition(kind: LogicRule['kind']): boolean {
  return kindWrites(kind) === 'condition'
}

/**
 * What a rule on this node is addressed by, and which kinds apply to it.
 *
 * The DATA path for a field, not the key path — pages are transparent for data,
 * so a field inside one is `needsVisa` in the model and `about.needsVisa` in the
 * tree. The React panel joined the key path, and every rule written on a field
 * inside a page was refused with *"No field has the data path"*: in the builder,
 * for as long as pages have existed.
 *
 * A field in a repeater row is addressed as the engine scopes it to each row,
 * `items[].note` — see `rulePathOf`.
 *
 * A page's rules are addressed by its KEY instead, because a page carries no
 * answer and so has no path — which is why a `skip` is its own kind rather than
 * `visible` pointed at a page
 * ([0087](../../../docs/decisions/0087-a-page-can-be-walked-past.md)).
 */
export function ruleTargetFor(document: FormSchema, keyPath: readonly string[]): { target: string; on: 'field' | 'page' } {
  const node = flatten(document).find((candidate) => candidate.keyPath.join('.') === keyPath.join('.'))
  if (node?.def.type === 'page') {
    return { target: keyPath[keyPath.length - 1] ?? keyPath.join('.'), on: 'page' }
  }
  const dataPath = dataPathOf(document, keyPath)
  return {
    target: dataPath === undefined ? keyPath.join('.') : rulePathOf(document, dataPath),
    on: 'field',
  }
}

/**
 * The rule a builder is about to add, composed once for both of them.
 *
 * A check has no expression, and a rule carrying both would be two rules in one
 * object with no answer to which verdict wins — the schema refuses it, so this
 * does not compose it.
 */
export function composeRule(input: {
  kind: LogicRule['kind']
  target: string
  draft: ConditionDraft
  /** What each compared field is, which decides how its value is written. */
  fields: readonly ConditionField[]
  check: string
  /** Raw CEL, for a kind that writes an expression rather than a condition. */
  expression?: string
  /** validate only: what the person reads while the rule fails (0198). */
  message?: string
  /** The document's rules, so a validate rule's code is its own on its field. */
  rules?: readonly LogicRule[]
}): LogicRule {
  const group = groupOf(input.draft, input.fields)
  const written =
    kindWrites(input.kind) === 'check'
      ? { check: input.check }
      : kindWrites(input.kind) === 'expression'
        ? // No `editor`: the comparison editor did not write this and cannot
          // regenerate it, and metadata claiming otherwise would be a lie the
          // next opening of the panel tells.
          { cel: input.expression ?? '' }
        : { cel: compileGroup(group), editor: group }
  const message = input.kind === 'validate' ? (input.message ?? '').trim() : ''
  return {
    target: input.target,
    kind: input.kind,
    ...written,
    // A code of its own on its field, which the message is said for. Without a message, none:
    // the engine's `invalid`, said in the reader's language — every rule used to carry
    // `condition`, which no catalogue words, and the person read that word (0198).
    ...(message === '' ? {} : { code: freshCode(input.rules ?? [], input.target), message }),
  } as LogicRule
}

/** `condition`, or `condition-2` and on, whichever no rule on the field reports yet. */
function freshCode(rules: readonly LogicRule[], target: string): string {
  const taken = new Set(rules.filter((rule) => rule.target === target).map((rule) => rule.code))
  let code = 'condition'
  for (let next = 2; taken.has(code); next++) code = `condition-${String(next)}`
  return code
}

/**
 * Whether a validate rule in a document of this version may say its own message (0198): from
 * spec 5. Held to the validator at every version by `logic.test.ts`, since the ledger says it
 * once and this says it again.
 */
export function ruleTakesMessage(specVersion: SpecVersion): boolean {
  return Number(specVersion) >= 5
}

/**
 * What a rule says while it rejects an answer, in the document's own language, as the logic panel
 * lists it beside the rule (0198); undefined for a rule with no message.
 */
export function ruleSays(document: FormSchema, rule: LogicRule): string | undefined {
  return rule.message === undefined ? undefined : resolveText(document, rule.message, document.i18n?.defaultLocale ?? '')
}

/** Whether what is on screen is enough to add. */
export function draftIsComplete(input: { kind: LogicRule['kind']; draft: ConditionDraft; check: string; expression?: string; message?: string }): boolean {
  // A check with no name asks nobody, an empty expression calculates nothing,
  // and an empty comparison compiles to an expression about nothing. Which of
  // the three applies depends on the kind.
  switch (kindWrites(input.kind)) {
    case 'check':
      return input.check.trim() !== ''
    case 'expression':
      return (input.expression ?? '').trim() !== ''
    default:
      // A validate rule says what is wrong as well, where it is asked to — an error that says
      // only that something is leaves the person to guess what would be right. `undefined` is
      // not asked: a document older than spec 5 cannot hold one (0198).
      return rowsOf(input.draft).every((row) => row.field !== '') && (input.kind !== 'validate' || input.message === undefined || input.message.trim() !== '')
  }
}

/**
 * Every message id the document refers to, in document order and deduplicated.
 *
 * The order matters: a translator works down a list and meets the questions in
 * the order somebody filling the form does, which is the only order that makes
 * the words next to each other mean anything.
 *
 * Framework-free, so both translation panes ask the same question. It walks the
 * model AND the layouts, because a section's heading is text a reader sees and
 * lives in the arrangement rather than in the model — and the logic, whose
 * rules' messages are read by the person an answer is refused for.
 */
export function referencedMessages(document: FormSchema): string[] {
  const found: string[] = []
  const seen = new Set<string>()
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) walk(item)
      return
    }
    if (typeof value !== 'object' || value === null) return
    const record = value as Record<string, unknown>
    const reference = record['$t']
    if (typeof reference === 'string') {
      if (!seen.has(reference)) {
        seen.add(reference)
        found.push(reference)
      }
      return
    }
    for (const item of Object.values(record)) walk(item)
  }
  walk(document.model)
  walk(document.layouts)
  // Last: a rule's message is met after the question it is about (0198).
  walk(document.logic)
  return found
}
