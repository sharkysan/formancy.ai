/**
 * A malformed fixture must fail loudly rather than silently testing nothing.
 *
 * The cheapest way to make a conformance suite worthless is a case that no
 * longer asserts what its name says — a typo in a path, a step key that was
 * renamed, an expectation with nothing to expect against. Every one of those is
 * rejected here, with the position in the file that caused it.
 */

import { SPEC_VERSIONS, modelDataPaths } from '@formancy/spec'
import type { FieldDef, FieldType, RuleKind } from '@formancy/spec'
import { COMMAND_SEPARATOR, fieldAtPath, pageKeys } from './paths.js'
import type { ConformanceSchema, Fixture, FixtureStep, StepKind } from './types.js'

export interface FixtureProblem {
  /** Where in the fixture, e.g. `steps[3].expectErrors.canton`. */
  readonly path: string
  readonly message: string
}

/** Thrown by `parseFixture`, carrying every problem found rather than the first. */
export class FixtureError extends Error {
  readonly problems: readonly FixtureProblem[]

  constructor(problems: readonly FixtureProblem[], label: string) {
    super(formatProblems(problems, label))
    this.name = 'FixtureError'
    this.problems = problems
  }
}

function formatProblems(problems: readonly FixtureProblem[], label: string): string {
  const lines = problems.map((problem) => `  - ${problem.path}: ${problem.message}`)
  return `Invalid fixture ${label}:\n${lines.join('\n')}`
}

/**
 * Every step key, in the order a reader of a fixture meets them.
 *
 * `Record<StepKind, true>` rather than a bare array so the compiler rejects a
 * step kind added to `FixtureStep` and forgotten here — a step key the
 * validator does not know is reported as a typo, which would turn a new step
 * kind into a mystery "unknown step" error at the far end of the toolchain.
 */
const STEP_KEYS: Record<StepKind, true> = {
  set: true,
  activate: true,
  addItem: true,
  removeItem: true,
  next: true,
  back: true,
  submit: true,
  expectVisible: true,
  expectHidden: true,
  expectValue: true,
  expectErrors: true,
  expectNoErrors: true,
  expectSubmit: true,
  expectPage: true,
}

const stepKeyNames = Object.keys(STEP_KEYS)

/**
 * Membership goes through a Set, never through the `in` operator on the record:
 * `'toString' in STEP_KEYS` is true via Object.prototype, so `in` would accept
 * any inherited name as a step key or a field type and crash the validator
 * further down. The records above stay for their compile-time totality only.
 */
const STEP_KEY_SET: ReadonlySet<string> = new Set(stepKeyNames)

/** The single key of a parsed step, for reporting. */
export function stepKind(step: FixtureStep): StepKind {
  const keys = Object.keys(step).filter((key) => STEP_KEY_SET.has(key))
  // Unreachable for a parsed fixture: `validateFixture` rejects any other shape.
  if (keys.length !== 1) throw new TypeError(`Not a step: ${JSON.stringify(step)}`)
  return keys[0] as StepKind
}

/**
 * Mirrors `FieldType` from @formancy/spec. Declared as a total record so the
 * compiler fails here the day the spec adds or drops a field type, rather than
 * the validator silently accepting a type the renderers cannot draw.
 */
const FIELD_TYPES: Record<FieldType, true> = {
  text: true,
  textarea: true,
  number: true,
  checkbox: true,
  select: true,
  radio: true,
  selectboxes: true,
  date: true,
  file: true,
  richtext: true,
  hidden: true,
  static: true,
  group: true,
  page: true,
  repeater: true,
}

const FIELD_TYPE_SET: ReadonlySet<string> = new Set(Object.keys(FIELD_TYPES))

/** Types that hold other fields, and are the only types allowed to declare them. */
const CONTAINER_TYPES: Partial<Record<FieldType, true>> = {
  group: true,
  page: true,
  repeater: true,
}

const CONTAINER_TYPE_SET: ReadonlySet<string> = new Set(Object.keys(CONTAINER_TYPES))

/**
 * Types that carry no accessible name of their own: `hidden` never renders and
 * `static` is prose, not a control. Every other leaf is a control a driver has
 * to find by its label.
 */
const UNLABELLED_TYPES: ReadonlySet<string> = new Set(['hidden', 'static'])

/**
 * Mirrors `RuleKind` from @formancy/spec, total for the same reason as
 * `FIELD_TYPES`: the compiler fails here the day the spec grows a kind.
 */
const RULE_KINDS: Record<RuleKind, true> = {
  visible: true,
  disabled: true,
  required: true,
  computed: true,
  validate: true,
}

const RULE_KIND_SET: ReadonlySet<string> = new Set(Object.keys(RULE_KINDS))

/**
 * Field properties the pre-spec fixture dialect used and the spec then landed
 * differently. Each one must be a loud error rather than an ignored extra key:
 * the review proved a `children` schema mounts as an EMPTY form in the engine
 * — and passes, because none of its assertions can reach a field.
 */
const RETIRED_FIELD_KEYS: Readonly<Record<string, string>> = {
  children: 'renamed: the spec calls this "fields"',
  visibleWhen: 'moved: behaviour lives in schema.logic rules, e.g. { "target": "...", "kind": "visible", "cel": "..." }',
  requiredWhen: 'moved: behaviour lives in schema.logic rules, e.g. { "target": "...", "kind": "required", "cel": "..." }',
  calculate: 'moved: behaviour lives in schema.logic rules, e.g. { "target": "...", "kind": "computed", "cel": "..." }',
}

/** Validate and narrow, or throw a `FixtureError` naming every problem. */
export function parseFixture(value: unknown): Fixture {
  const problems = validateFixture(value)
  if (problems.length > 0) throw new FixtureError(problems, labelOf(value))
  return value as Fixture
}

function labelOf(value: unknown): string {
  const record = asRecord(value)
  const name = record?.['name']
  return typeof name === 'string' && name !== '' ? `"${name}"` : '(unnamed)'
}

/** Validate a value against the fixture format. An empty result means valid. */
export function validateFixture(value: unknown): readonly FixtureProblem[] {
  const fixture = asRecord(value)
  if (fixture === undefined) {
    return [{ path: '$', message: `expected an object, got ${describeValue(value)}` }]
  }

  const problems: FixtureProblem[] = []

  if (typeof fixture['name'] !== 'string' || fixture['name'] === '') {
    problems.push({ path: 'name', message: 'expected a non-empty string' })
  }
  if (fixture['description'] !== undefined && typeof fixture['description'] !== 'string') {
    problems.push({ path: 'description', message: 'expected a string' })
  }
  if (fixture['tags'] !== undefined && !isStringArray(fixture['tags'])) {
    problems.push({ path: 'tags', message: 'expected an array of strings' })
  }

  const schemaProblems = validateSchema(fixture['schema'], 'schema')
  problems.push(...schemaProblems)

  // Path references are only checked against a schema that is itself sound;
  // otherwise one broken schema reports a problem per step and buries its cause.
  const schema = schemaProblems.length === 0 ? (fixture['schema'] as ConformanceSchema) : undefined

  const initialValues = fixture['initialValues']
  if (initialValues !== undefined) {
    const record = asRecord(initialValues)
    if (record === undefined) {
      problems.push({ path: 'initialValues', message: 'expected an object' })
    } else {
      problems.push(...validateValueMap(record, 'initialValues', schema))
    }
  }

  const steps = fixture['steps']
  if (!Array.isArray(steps)) {
    problems.push({ path: 'steps', message: `expected an array, got ${describeValue(steps)}` })
  } else if (steps.length === 0) {
    problems.push({ path: 'steps', message: 'expected at least one step' })
  } else {
    let submitted = false
    steps.forEach((step, index) => {
      problems.push(...validateStep(step, `steps[${index}]`, schema, submitted))
      if (asRecord(step)?.['submit'] === true) submitted = true
    })
  }

  return problems
}

function validateSchema(value: unknown, at: string): FixtureProblem[] {
  const schema = asRecord(value)
  if (schema === undefined) {
    return [{ path: at, message: `expected an object, got ${describeValue(value)}` }]
  }

  const problems: FixtureProblem[] = []

  if (!SPEC_VERSIONS.includes(schema['specVersion'] as never)) {
    problems.push({
      path: `${at}.specVersion`,
      message: `expected one of ${SPEC_VERSIONS.map((version) => `"${version}"`).join(', ')}`,
    })
  }
  for (const key of ['id', 'title'] as const) {
    if (typeof schema[key] !== 'string' || schema[key] === '') {
      problems.push({ path: `${at}.${key}`, message: 'expected a non-empty string' })
    }
  }

  const model = asRecord(schema['model'])
  if (model === undefined) {
    problems.push({
      path: `${at}.model`,
      message: `expected an object, got ${describeValue(schema['model'])}`,
    })
    return problems
  }

  const fields = model['fields']
  if (!Array.isArray(fields)) {
    problems.push({
      path: `${at}.model.fields`,
      message: `expected an array, got ${describeValue(fields)}`,
    })
    return problems
  }

  // The names a message reference may resolve to. A fixture is allowed to be
  // written in references instead of literals, but THE RULE still holds: every
  // control must end up with an accessible name, so a reference that resolves
  // nowhere is exactly as unfindable as no label at all.
  const messages = messageCatalogue(schema['i18n'])
  problems.push(...validateI18n(schema['i18n'], `${at}.i18n`))

  const fieldProblems = validateFields(fields, `${at}.model.fields`, messages)
  problems.push(...fieldProblems)

  // Rule targets are only checked against a model that is itself sound, for
  // the same reason step paths are: one broken field would otherwise report a
  // problem per rule and bury its cause.
  const targets =
    fieldProblems.length === 0
      ? // The spec's own walk, so a rule target means exactly what it means to
        // the engine and to diffSchemas. The cast bridges the fixture's readonly
        // field tree to the spec's mutable one; the walk never mutates.
        new Set(modelDataPaths({ fields: fields as FieldDef[] }))
      : undefined
  problems.push(...validateLogic(schema['logic'], `${at}.logic`, targets))

  return problems
}

/**
 * The logic section is the spec's `FormLogic`, verbatim. A rule aimed at a
 * path the model does not define would evaluate against nothing, so targets
 * are held to the model the same way step paths are — in the spec's data-path
 * grammar, where a row-scoped target reads `contacts[].email`.
 */
function validateLogic(
  value: unknown,
  at: string,
  targets: ReadonlySet<string> | undefined,
): FixtureProblem[] {
  if (value === undefined) return []
  const logic = asRecord(value)
  if (logic === undefined) {
    return [{ path: at, message: `expected an object with a rules array, got ${describeValue(value)}` }]
  }

  const rules = logic['rules']
  if (!Array.isArray(rules)) {
    return [{ path: `${at}.rules`, message: `expected an array, got ${describeValue(rules)}` }]
  }
  if (rules.length === 0) {
    return [{ path: `${at}.rules`, message: 'expected at least one rule; drop the logic section instead' }]
  }

  const problems: FixtureProblem[] = []
  rules.forEach((value, index) => {
    const where = `${at}.rules[${index}]`
    const rule = asRecord(value)
    if (rule === undefined) {
      problems.push({ path: where, message: `expected an object, got ${describeValue(value)}` })
      return
    }

    const target = rule['target']
    if (typeof target !== 'string' || target === '') {
      problems.push({ path: `${where}.target`, message: 'expected a data path, e.g. "address.city" or "items[].qty"' })
    } else if (targets !== undefined && !targets.has(target)) {
      problems.push({ path: `${where}.target`, message: `no field at data path ${JSON.stringify(target)}` })
    }

    const kind = rule['kind']
    if (typeof kind !== 'string' || !RULE_KIND_SET.has(kind)) {
      problems.push({
        path: `${where}.kind`,
        message: `expected one of ${Object.keys(RULE_KINDS).join(', ')}, got ${JSON.stringify(kind)}`,
      })
    }

    if (typeof rule['cel'] !== 'string' || rule['cel'] === '') {
      problems.push({ path: `${where}.cel`, message: 'expected a non-empty CEL expression' })
    }

    if (rule['code'] !== undefined && (typeof rule['code'] !== 'string' || rule['code'] === '')) {
      problems.push({ path: `${where}.code`, message: 'expected a non-empty string' })
    }
  })

  return problems
}

function validateFields(
  fields: readonly unknown[],
  at: string,
  messages: ReadonlySet<string> | undefined,
): FixtureProblem[] {
  const problems: FixtureProblem[] = []
  const seen = new Set<string>()

  fields.forEach((value, index) => {
    const where = `${at}[${index}]`
    const field = asRecord(value)
    if (field === undefined) {
      problems.push({ path: where, message: `expected an object, got ${describeValue(value)}` })
      return
    }

    const key = field['key']
    if (typeof key !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      problems.push({
        path: `${where}.key`,
        message: 'expected an identifier: a letter or underscore followed by letters, digits or underscores',
      })
    } else if (seen.has(key)) {
      problems.push({ path: `${where}.key`, message: `duplicate key "${key}" among its siblings` })
    } else {
      seen.add(key)
    }

    for (const [retired, hint] of Object.entries(RETIRED_FIELD_KEYS)) {
      if (field[retired] !== undefined) {
        problems.push({ path: `${where}.${retired}`, message: hint })
      }
    }

    const type = field['type']
    if (typeof type !== 'string' || !FIELD_TYPE_SET.has(type)) {
      problems.push({
        path: `${where}.type`,
        message: `expected one of ${Object.keys(FIELD_TYPES).join(', ')}, got ${JSON.stringify(type)}`,
      })
      return
    }

    const nested = field['fields']
    const isContainer = CONTAINER_TYPE_SET.has(type)
    if (isContainer) {
      if (!Array.isArray(nested) || nested.length === 0) {
        problems.push({ path: `${where}.fields`, message: `a ${type} needs at least one field` })
      } else {
        problems.push(...validateFields(nested, `${where}.fields`, messages))
      }
    } else if (nested !== undefined) {
      problems.push({ path: `${where}.fields`, message: `a ${type} cannot hold fields` })
    }

    const labelProblem = accessibleNameProblem(field['label'], messages)
    if (!isContainer && !UNLABELLED_TYPES.has(type)) {
      // A driver reaches a control by role and accessible name, and nothing
      // else — see driver.ts. A control without a label is therefore a control
      // no conforming driver can find, so the case could not run honestly.
      if (labelProblem !== undefined) {
        problems.push({
          path: `${where}.label`,
          message: `a ${type} ${labelProblem}: drivers resolve controls by accessible name only`,
        })
      }
    } else if (field['label'] !== undefined && labelProblem !== undefined) {
      problems.push({ path: `${where}.label`, message: labelProblem })
    }

    // Option labels are accessible names too: a driver clicks a radio by the
    // name beside it, not by its stored value.
    const options = field['options']
    if (Array.isArray(options)) {
      for (const [index, option] of options.entries()) {
        const record = asRecord(option)
        if (record === undefined) continue
        const problem = accessibleNameProblem(record['label'], messages)
        if (problem !== undefined) {
          problems.push({ path: `${where}.options[${String(index)}].label`, message: problem })
        }
      }
    }
  })

  return problems
}

/**
 * What is wrong with a piece of text that has to become an accessible name, or
 * undefined when it will. Accepts either a literal or a `{ $t }` reference,
 * because the renderers accept both — and insists the reference resolves,
 * because a driver searching for an unresolved id finds nothing.
 */
function accessibleNameProblem(
  label: unknown,
  messages: ReadonlySet<string> | undefined,
): string | undefined {
  if (typeof label === 'string') {
    return label === '' ? 'needs a non-empty label' : undefined
  }
  const record = asRecord(label)
  const ref = record?.['$t']
  if (typeof ref !== 'string') return 'needs a non-empty label'
  if (messages === undefined) {
    return `refers to "${ref}", but the fixture has no i18n section`
  }
  if (!messages.has(ref)) {
    return `refers to "${ref}", which the default locale does not define`
  }
  return undefined
}

/** The message ids the default locale defines, or undefined when unlocalised. */
function messageCatalogue(value: unknown): ReadonlySet<string> | undefined {
  const i18n = asRecord(value)
  if (i18n === undefined) return undefined
  const locale = i18n['defaultLocale']
  if (typeof locale !== 'string') return new Set()
  const catalogue = asRecord(asRecord(i18n['messages'])?.[locale])
  if (catalogue === undefined) return new Set()
  return new Set(Object.keys(catalogue).filter((id) => typeof catalogue[id] === 'string'))
}

function validateI18n(value: unknown, at: string): FixtureProblem[] {
  if (value === undefined) return []
  const i18n = asRecord(value)
  if (i18n === undefined) {
    return [{ path: at, message: `expected an object, got ${describeValue(value)}` }]
  }

  const problems: FixtureProblem[] = []
  const locale = i18n['defaultLocale']
  if (typeof locale !== 'string' || locale === '') {
    problems.push({ path: `${at}.defaultLocale`, message: 'expected a non-empty string' })
  }

  const messages = asRecord(i18n['messages'])
  if (messages === undefined) {
    problems.push({
      path: `${at}.messages`,
      message: `expected an object, got ${describeValue(i18n['messages'])}`,
    })
    return problems
  }

  if (typeof locale === 'string' && asRecord(messages[locale]) === undefined) {
    problems.push({
      path: `${at}.messages.${locale}`,
      message: 'the default locale needs a catalogue: it is what every other locale falls back to',
    })
  }

  for (const [name, catalogue] of Object.entries(messages)) {
    const entries = asRecord(catalogue)
    if (entries === undefined) {
      problems.push({ path: `${at}.messages.${name}`, message: 'expected an object' })
      continue
    }
    for (const [id, text] of Object.entries(entries)) {
      if (typeof text !== 'string' || text === '') {
        problems.push({
          path: `${at}.messages.${name}.${id}`,
          message: 'expected a non-empty string',
        })
      }
    }
  }

  return problems
}

function validateStep(
  value: unknown,
  at: string,
  schema: ConformanceSchema | undefined,
  precededBySubmit: boolean,
): FixtureProblem[] {
  const step = asRecord(value)
  if (step === undefined) {
    return [{ path: at, message: `expected an object, got ${describeValue(value)}` }]
  }

  const keys = Object.keys(step)
  const known = keys.filter((key) => STEP_KEY_SET.has(key))

  if (known.length === 0) {
    return [
      {
        path: at,
        message: `unknown step ${JSON.stringify(keys[0] ?? '')}; expected exactly one of ${stepKeyNames.join(', ')}`,
      },
    ]
  }
  if (known.length > 1 || known.length !== keys.length) {
    return [
      {
        path: at,
        message: `expected exactly one step key, got ${keys.map((key) => JSON.stringify(key)).join(', ')}`,
      },
    ]
  }

  const kind = known[0] as StepKind
  const payload = step[kind]
  const where = `${at}.${kind}`

  switch (kind) {
    case 'set':
    case 'expectValue': {
      const record = asRecord(payload)
      if (record === undefined) return [{ path: where, message: 'expected an object of path to value' }]
      if (Object.keys(record).length === 0) {
        return [{ path: where, message: 'expected at least one path' }]
      }
      return validateValueMap(record, where, schema)
    }

    case 'expectVisible':
    case 'expectHidden': {
      if (!isStringArray(payload)) return [{ path: where, message: 'expected an array of paths' }]
      if (payload.length === 0) return [{ path: where, message: 'expected at least one path' }]
      return payload.flatMap((path, index) => fieldPathProblems(path, `${where}[${index}]`, schema))
    }

    case 'expectErrors': {
      const record = asRecord(payload)
      if (record === undefined) {
        return [{ path: where, message: 'expected an object of path to message codes' }]
      }
      if (Object.keys(record).length === 0) {
        return [{ path: where, message: 'expected at least one path' }]
      }
      return Object.entries(record).flatMap(([path, codes]) => {
        const problems = fieldPathProblems(path, `${where}.${path}`, schema)
        if (!isStringArray(codes)) {
          problems.push({
            path: `${where}.${path}`,
            message: 'expected an array of message codes, e.g. ["required"]',
          })
        }
        return problems
      })
    }

    case 'expectNoErrors': {
      if (payload === true) return []
      if (!isStringArray(payload)) return [{ path: where, message: 'expected true or an array of paths' }]
      if (payload.length === 0) return [{ path: where, message: 'expected true or at least one path' }]
      return payload.flatMap((path, index) => fieldPathProblems(path, `${where}[${index}]`, schema))
    }

    case 'submit':
    case 'next':
    case 'back':
      return payload === true ? [] : [{ path: where, message: 'expected true' }]

    case 'expectSubmit': {
      const record = asRecord(payload)
      if (record === undefined) return [{ path: where, message: 'expected an object' }]
      const problems: FixtureProblem[] = []
      if (!precededBySubmit) {
        // There is no submit result to assert against, so the step would either
        // pass for free or fail for a reason that has nothing to do with the
        // renderer. Either way the case stops meaning what it says.
        problems.push({ path: where, message: 'no submit step runs before it' })
      }
      if (record['status'] !== 'accepted' && record['status'] !== 'rejected') {
        problems.push({ path: `${where}.status`, message: 'expected "accepted" or "rejected"' })
      }
      if (record['data'] !== undefined && !isJsonValue(record['data'])) {
        problems.push({ path: `${where}.data`, message: 'expected JSON' })
      }
      return problems
    }

    case 'activate': {
      if (typeof payload !== 'string' || payload === '') {
        return [{ path: where, message: 'expected a field path or a command path such as "contacts#add"' }]
      }
      const target = payload.split(COMMAND_SEPARATOR)[0] ?? ''
      // A bare command such as "#next" addresses the form itself, not a field.
      return target === '' ? [] : fieldPathProblems(target, where, schema)
    }

    case 'addItem': {
      if (typeof payload !== 'string' || payload === '') {
        return [{ path: where, message: 'expected a repeater path' }]
      }
      return repeaterPathProblems(payload, where, schema, 'addLabel')
    }

    case 'removeItem': {
      const record = asRecord(payload)
      if (record === undefined) return [{ path: where, message: 'expected { path, index }' }]
      const problems: FixtureProblem[] = []
      if (typeof record['path'] !== 'string' || record['path'] === '') {
        problems.push({ path: `${where}.path`, message: 'expected a repeater path' })
      } else {
        problems.push(...repeaterPathProblems(record['path'], `${where}.path`, schema, 'removeLabel'))
      }
      if (typeof record['index'] !== 'number' || !Number.isInteger(record['index']) || record['index'] < 0) {
        problems.push({ path: `${where}.index`, message: 'expected a non-negative integer' })
      }
      return problems
    }

    case 'expectPage': {
      if (typeof payload !== 'string' || payload === '') {
        return [{ path: where, message: 'expected a page key' }]
      }
      if (schema !== undefined && !pageKeys(schema).includes(payload)) {
        return [{ path: where, message: `no page with key ${JSON.stringify(payload)}` }]
      }
      return []
    }

    default:
      return assertNever(kind)
  }
}

function validateValueMap(
  record: Record<string, unknown>,
  at: string,
  schema: ConformanceSchema | undefined,
): FixtureProblem[] {
  return Object.entries(record).flatMap(([path, value]) => {
    const problems = fieldPathProblems(path, `${at}.${path}`, schema)
    if (!isJsonValue(value)) {
      problems.push({ path: `${at}.${path}`, message: `expected JSON, got ${describeValue(value)}` })
    }
    return problems
  })
}

/**
 * A path a fixture names must exist in the schema it ships with.
 *
 * Without this check a typo turns an assertion into a tautology: `expectHidden`
 * on a misspelled path passes, and the case silently tests nothing for years.
 */
function fieldPathProblems(
  path: string,
  at: string,
  schema: ConformanceSchema | undefined,
): FixtureProblem[] {
  if (schema === undefined) return []
  if (fieldAtPath(schema, path) === undefined) {
    return [{ path: at, message: `no field at path ${JSON.stringify(path)}` }]
  }
  return []
}

function repeaterPathProblems(
  path: string,
  at: string,
  schema: ConformanceSchema | undefined,
  control: 'addLabel' | 'removeLabel',
): FixtureProblem[] {
  if (schema === undefined) return []
  const field = fieldAtPath(schema, path)
  if (field === undefined) {
    return [{ path: at, message: `no field at path ${JSON.stringify(path)}` }]
  }
  if (field.type !== 'repeater') {
    return [{ path: at, message: `expected a repeater, but ${JSON.stringify(path)} is a ${field.type}` }]
  }
  // The step will press this control, and a driver may only press by
  // accessible name, so a repeater without the name cannot run the step.
  const label = field[control]
  if (typeof label !== 'string' || label === '') {
    return [
      {
        path: at,
        message: `repeater ${JSON.stringify(path)} needs a non-empty ${control}: drivers press its ${
          control === 'addLabel' ? 'add' : 'remove'
        } control by accessible name only`,
      },
    ]
  }
  return []
}

function assertNever(value: never): never {
  throw new TypeError(`Unhandled step kind: ${String(value)}`)
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isJsonValue(value: unknown): boolean {
  if (value === null) return true
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return true
    case 'number':
      // JSON has no NaN or Infinity, so a fixture carrying one would not
      // survive the file round-trip that every driver reads it through.
      return Number.isFinite(value)
    case 'object':
      return Array.isArray(value)
        ? value.every(isJsonValue)
        : Object.values(value as Record<string, unknown>).every(isJsonValue)
    default:
      return false
  }
}

function describeValue(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'an array'
  return typeof value
}
