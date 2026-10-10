import { formatPath } from '@formancy/core'
import type { BuiltInErrorCode, Scenario } from '@formancy/core'
import { DECLINE_KEY, LIST_VALUED_FIELD_TYPES, resolveText } from '@formancy/spec'
import type { FieldDef, FieldType, FormSchema, Text } from '@formancy/spec'
import type { DraftProblem, UnusableDraft } from './scenario-drafts.js'

/**
 * What a model is told when it is asked for a form's examples.
 *
 * Model-facing English, as `authoring.ts` is: a model is asked in English whatever the
 * author speaks, and what is shown to the author about a run is the catalogue's.
 *
 * **The model is never shown a rule.** No condition, no pattern, no bound — not even
 * which fields are required. An example exists to tell the rule somebody wrote from the
 * rule they meant ([0110](../../../docs/decisions/0110-a-form-is-checked-against-examples.md)),
 * and a model shown `country != "CH"` writes an example that expects exactly what
 * `country != "CH"` does: an example that agrees with the rule whether the rule is right or
 * wrong, which checks nothing and reads as though it did
 * ([0162](../../../docs/decisions/0162-an-example-is-drafted-from-what-the-author-said.md)).
 * So it is shown the form's shape — the paths, types, labels and options an example has to
 * name — the codes an error can carry, and what the author said, and nothing about what
 * the rules do. `scenario-prompt.test.ts` walks a document's rules and constraints and
 * finds none of them in the prompt.
 */

/**
 * Every code the engine reports of its own accord, as a set a prompt can list.
 *
 * Satisfies `Record<BuiltInErrorCode, true>`, so a code added to the engine's vocabulary
 * does not compile here until the model is told it too — and a code that is not the
 * engine's cannot be listed.
 */
export const BUILT_IN_ERROR_CODES = {
  required: true,
  invalid: true,
  check_unavailable: true,
  type: true,
  option: true,
  duplicate: true,
  row: true,
  min: true,
  max: true,
  step: true,
  minLength: true,
  maxLength: true,
  pattern: true,
  mask: true,
  email: true,
  url: true,
  uuid: true,
  shape: true,
  earliest: true,
  latest: true,
  minItems: true,
  maxItems: true,
  maxFileSize: true,
  accept: true,
  box: true,
  maxPoints: true,
} as const satisfies Record<BuiltInErrorCode, true>

/**
 * The form the briefing's example is written for: a country and a canton, and the rules
 * that make the example hold. The rules are here for `scenario-prompt.test.ts`, which runs
 * the example against this form; the briefing shows the form's fields, as every prompt
 * does, and never these rules.
 */
export const EXAMPLE_FORM: FormSchema = {
  specVersion: '4',
  id: 'example',
  title: 'Where you live',
  model: {
    fields: [
      {
        key: 'country',
        type: 'select',
        label: 'Country',
        options: [
          { value: 'CH', label: 'Switzerland' },
          { value: 'DE', label: 'Germany' },
        ],
      },
      { key: 'canton', type: 'text', label: 'Canton' },
    ],
  },
  logic: {
    rules: [
      { target: 'canton', kind: 'visible', cel: 'country == "CH"' },
      { target: 'canton', kind: 'required', cel: 'country == "CH"' },
    ],
  },
}

/** What the author of `EXAMPLE_FORM` said it should do. */
export const EXAMPLE_INTENT = 'Ask for a canton only in Switzerland, and there it must be answered.'

/** The example the briefing shows, held by the test to its own form. */
export const EXAMPLE_SCENARIO: Scenario = {
  name: 'Switzerland without a canton is refused',
  because: 'there it must be answered',
  changes: { country: 'CH' },
  valid: false,
  errors: { canton: ['required'] },
  visible: { canton: true },
}

/**
 * What an answer of each kind looks like as JSON, where the type's name does not say.
 *
 * The temporal ones are the spec's one shape for each type; `scenario-prompt.test.ts`
 * runs them through the engine as answers, so a shape that changed fails there.
 */
export const ANSWER_EXAMPLES: Partial<Record<FieldType, unknown>> = {
  number: 42,
  checkbox: true,
  date: '2026-10-06',
  time: '09:30',
  datetime: '2026-10-06T09:30:00Z',
  selectboxes: ['a', 'b'],
  ranking: ['b', 'a'],
  matrix: { speed: 'good' },
}

/**
 * The day every example runs on: `runScenarios` fixes the clock unless a caller passes its
 * own, so an example means the same thing tomorrow. `scenario-prompt.test.ts` reads it back
 * from the engine.
 */
export const EXAMPLE_TODAY = '2026-10-06'

export interface ScenarioPromptOptions {
  /** Where every example starts — the form's sample. Shown, because it is where they start. */
  readonly initialValue?: Readonly<Record<string, unknown>> | undefined
  /**
   * The examples the form already has. Only their names are shown: what they expect is
   * the rules as somebody checked them, and a model shown that would copy it.
   */
  readonly existing?: readonly Scenario[] | undefined
}

/** The briefing and the request, for `askChecked` to send. */
export interface ScenarioPrompt {
  readonly system: string
  readonly user: string
}

/** Asking a model for examples of `document`, from what its author said it should do. */
export function scenarioPrompt(
  document: FormSchema,
  intent: string,
  options: ScenarioPromptOptions = {},
): ScenarioPrompt {
  return { system: scenarioBriefing(), user: request(document, intent, options) }
}

/**
 * The briefing, which is the same for every form — and so can be pinned by a server that
 * asks the model on the browser's behalf (`model-requests.ts`, 0166).
 */
export function scenarioBriefing(): string {
  const decline = JSON.stringify({ [DECLINE_KEY]: '<why, for the person who asked>' })
  return [
    'You write examples for a form: answers somebody might give, each with what the form should make of them. The form’s engine runs every example, and a person reads which ones hold. An example that does not hold means the example or the form is wrong, and the person decides which.',
    '',
    'You are shown the form’s fields and what its author said it should do, and never its rules. That is deliberate. An example exists to check the rules against what the author meant, and one written from the rules agrees with them whether they are right or wrong. Write every expectation from the author’s words. Where the words do not say, leave that expectation out rather than guess.',
    '',
    'Answer with one JSON object and nothing else: {"scenarios": [ ... ]}. Each example is an object with these keys and no others:',
    '- "name": a short sentence saying what it checks. Unique among your examples, and none of the names already taken.',
    '- "because": optional. The part of what the author said that it checks.',
    '- "changes": the answers to set, by path, in the order written, each path once. Real JSON values of the field’s own kind.',
    '- "valid": true or false, whether the whole form passes validation afterwards.',
    '- "errors": by path, the error codes expected there. Compared exactly, both ways: every path that has an error is listed with every code it has, and a path not listed is expected to have none. Leave it out only when "valid" is true.',
    '- "visible": optional. By path, true when the field is shown and false when it is hidden. A hidden field is not validated.',
    '- "values": optional. By path, the value a field holds afterwards, for a field the form fills in itself.',
    '- "absent": optional. Paths whose answer the submission must not carry at all, such as a hidden field’s answer that is cleared.',
    '',
    `Answers as JSON, by field type: ${Object.entries(ANSWER_EXAMPLES)
      .map(([type, example]) => `${type} ${JSON.stringify(example)}`)
      .join(', ')}. A select or radio answer is one option value, and a list-valued field’s empty answer is [], never null. Anything else that holds text is a string.`,
    `Every example starts from the starting answers, never from the example before it, and runs as though today were ${EXAMPLE_TODAY}.`,
    '',
    'For example, for this form:',
    inventory(EXAMPLE_FORM),
    `whose author said: ${EXAMPLE_INTENT}`,
    'one example is:',
    JSON.stringify({ scenarios: [EXAMPLE_SCENARIO] }),
    '',
    `If what the author said cannot be checked with examples of this shape, do not write examples that check part of it: answer ${decline} instead.`,
  ].join('\n')
}

function request(document: FormSchema, intent: string, options: ScenarioPromptOptions): string {
  const taken = (options.existing ?? []).map((scenario) => scenario.name)
  const start = options.initialValue
  return [
    `The form: ${JSON.stringify(document.title)}.`,
    'Its fields, by the path an example names each one with:',
    inventory(document),
    `A field inside a group is named through the group, as ${formatPath(['address', 'street'])}, and a field in a repeater’s row by the row’s position from 0, as ${formatPath(['items', 0, 'note'])}. A group or a repeater is not itself a path.`,
    '',
    `The error codes the engine reports by itself: ${Object.keys(BUILT_IN_ERROR_CODES).join(', ')}.`,
    ...ownCodes(document),
    '',
    start === undefined || Object.keys(start).length === 0
      ? 'Every example starts from an empty form.'
      : `Every example starts from these answers: ${JSON.stringify(start)}`,
    taken.length === 0
      ? 'No names are taken yet.'
      : `Names already taken: ${taken.map((name) => JSON.stringify(name)).join(', ')}.`,
    '',
    'What the author said the form should do:',
    intent,
  ].join('\n')
}

/**
 * What this form's `validate` rules may report besides the engine's own codes: the codes they
 * name, by name alone, and that a rule may work out one of its own. Never the rule: which
 * field it is on and what it says are what an example is there to check.
 *
 * A rule whose condition evaluates to a string reports that string as its code, with a
 * `code` or without (`engine.ts`). That code is in the condition, which is withheld, so it
 * cannot be listed; saying the rules name none would be false, and a model trusting it
 * writes `invalid` and fails for a reason that is not about the rule.
 */
function ownCodes(document: FormSchema): string[] {
  const rules = (document.logic?.rules ?? []).filter((rule) => rule.kind === 'validate')
  if (rules.length === 0) return ['This form’s rules name no codes of their own.']
  const named = [...new Set(rules.flatMap((rule) => (rule.code ? [rule.code] : [])))].sort()
  return [
    ...(named.length === 0 ? [] : [`This form’s rules may also report: ${named.join(', ')}.`]),
    'A rule may also report a code its own condition works out, which this request cannot list.',
  ]
}

const LIST_VALUED: ReadonlySet<string> = new Set(LIST_VALUED_FIELD_TYPES)

/**
 * One line per field an example can name: its path, type and label, and the values it can
 * hold when the document lists them. What bounds an answer is not here.
 */
function inventory(document: FormSchema): string {
  const locale = document.i18n?.defaultLocale ?? ''
  const say = (text: Text | undefined): string | undefined => {
    const resolved = resolveText(document, text, locale)
    return resolved === undefined || resolved === '' ? undefined : resolved
  }
  const choices = (list: readonly { value: string; label: Text }[]): string =>
    list
      .map((option) => {
        const label = say(option.label)
        return label === undefined || label === option.value
          ? JSON.stringify(option.value)
          : `${JSON.stringify(option.value)} (${label})`
      })
      .join(', ')

  const lines: string[] = []
  const walk = (fields: readonly FieldDef[], at: readonly (string | number)[]): void => {
    for (const field of fields) {
      // A page scopes nothing, so its fields are named as though it were not there.
      if (field.type === 'page') walk(field.fields ?? [], at)
      else if (field.type === 'group') walk(field.fields ?? [], [...at, field.key])
      else if (field.type === 'repeater') walk(field.fields ?? [], [...at, field.key, 0])
      else lines.push(`- ${formatPath([...at, field.key])}: ${describe(field)}`)
    }
  }
  const describe = (field: FieldDef): string => {
    const parts: string[] = [field.type]
    const label = say(field.label)
    if (label !== undefined) parts.push(JSON.stringify(label))
    if (field.type === 'matrix') {
      parts.push(`an object from each row (${choices(field.rows ?? [])}) to one of ${choices(field.options ?? [])}`)
    } else if (field.options !== undefined && field.options.length > 0) {
      parts.push(LIST_VALUED.has(field.type) ? `a list of ${choices(field.options)}` : `one of ${choices(field.options)}`)
    } else if (field.optionsSource !== undefined) {
      parts.push('its options come from a list this request does not show')
    } else if (LIST_VALUED.has(field.type)) {
      parts.push('a list')
    }
    return parts.join(', ')
  }
  walk(document.model.fields, [])
  return lines.length === 0 ? '- (no fields)' : lines.join('\n')
}

/**
 * What was wrong with an answer that held no example to keep, as the model is told it —
 * in the full request and as the follow-up alike.
 */
export function scenarioComplaint(problem: DraftProblem): string {
  return `Your previous answer was rejected. Fix exactly this and answer again:\n${detail(problem)}`
}

function detail(problem: DraftProblem): string {
  switch (problem.kind) {
    case 'not-json':
      return 'That was not JSON. Answer with the object alone: no commentary, no code fence.'
    case 'unexplained-decline':
      return `A decline needs a reason, written for the person who asked. If the author’s words cannot be checked with examples, answer ${JSON.stringify({ [DECLINE_KEY]: '<why, for the person who asked>' })}; if they can, answer with the examples.`
    case 'no-list':
      return 'The answer has no "scenarios" list. Answer {"scenarios": [ ... ]}.'
    case 'none-usable':
      return problem.unusable.length === 0
        ? 'The "scenarios" list is empty. Write at least one example.'
        : ['No example in it could be used:', ...problem.unusable.map((item) => `- ${unusable(item)}`)].join('\n')
  }
}

function unusable(item: UnusableDraft): string {
  const which = `Example ${String(item.position)}${item.name === undefined ? '' : ` (${JSON.stringify(item.name)})`}`
  switch (item.reason) {
    case 'not-an-object':
      return `${which} is not an object.`
    case 'unknown-key':
      return `${which} has "${item.part ?? ''}", which is not one of the keys an example has.`
    case 'no-name':
      return `${which} has no name.`
    case 'name-taken':
      return `${which} has a name that is already taken.`
    case 'name-repeated':
      return `${which} has the same name as an example before it.`
    case 'no-changes':
      return `${which} has no "changes" object.`
    case 'no-verdict':
      return `${which} does not say whether the form is "valid", as true or false.`
    case 'malformed':
      return `${which} has a "${item.part ?? ''}" that is not what an example holds there.`
  }
}
