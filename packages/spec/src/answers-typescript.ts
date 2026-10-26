import { ANSWER_KINDS } from './answers.js'
import { schemaHash } from './hash.js'
import { resolveText } from './presentation.js'
import { ROW_ID } from './types.js'
import type { FieldDef, FieldOption, FormSchema, TemporalFieldType } from './types.js'

/**
 * The TypeScript type of what a form's submissions hold, as the source of a module (0190).
 *
 * **Printed from `ANSWER_KINDS`**, the table the engine checks every answer against
 * (0189), so the type and the replay are two readings of one decision rather than two
 * decisions. What the engine accepts compiles against it, and what the engine refuses
 * does not: `packages/cli/src/agreement.test.ts` holds that, value by value.
 *
 * **Every key is optional.** An unanswered field has no key, a rule can hide any field and
 * take its answer with it, and `required` promises an answer only for a field shown when the
 * server replays the submission. Narrowing a required field to present would be a second
 * copy of the engine's hiding logic, so it is not done.
 *
 * **A string, so a build script and the command print the same thing.** `formancy types` in
 * `@formancy/cli` is this function and a file write.
 */
export function answersTypeScript(schema: FormSchema, options: AnswersTypeOptions = {}): string {
  const name = options.name ?? answersTypeName(schema.id)
  if (!IDENTIFIER.test(name)) throw new Error(`"${name}" is not a TypeScript identifier, so it cannot name the type.`)

  const printer = new Printer(schema)
  const body = printer.members(schema.model.fields, 1)
  const title = JSON.stringify(schema.title)
  const imports = [...printer.imports].sort()

  return [
    ...comment(
      `What a submission of ${title} holds: generated from the form by formancy. Do not edit; generate it again when the form changes. Form ${JSON.stringify(schema.id)}, spec version ${schema.specVersion}, schema hash ${schemaHash(schema)}.`,
    ),
    '',
    ...(imports.length === 0 ? [] : [`import type { ${imports.join(', ')} } from '@formancy/spec'`, '']),
    '/**',
    ...wrap(
      `The answers to ${title}. Every key may be absent: an unanswered field has no key, a rule may hide any field and take its answer with it, and \`required\` promises an answer only for a field that is shown.`,
      ' * ',
    ),
    ' */',
    `export interface ${name} {`,
    ...body,
    '}',
    '',
  ].join('\n')
}

export interface AnswersTypeOptions {
  /** What to call the type. By default, `answersTypeName` of the form's id. */
  name?: string
}

/** The form's id in PascalCase followed by `Answers`: `contact-us` is `ContactUsAnswers`. */
export function answersTypeName(formId: string): string {
  const pascal = formId
    .split(/[^A-Za-z0-9]+/)
    .filter((part) => part !== '')
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join('')
  return `${/^[0-9]/.test(pascal) ? 'Form' : ''}${pascal}Answers`
}

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/

/** The form each temporal answer takes, said where a reader of the type will look. */
const TEMPORAL_FORMS: Record<TemporalFieldType, string> = {
  date: '`YYYY-MM-DD`',
  time: '`HH:MM`, a wall clock with no zone',
  datetime: '`YYYY-MM-DDTHH:MM:SSZ`, an instant in UTC',
}

class Printer {
  /** The format's own types the printed module needs, imported rather than spelled out. */
  readonly imports = new Set<'SignatureAnswer' | 'StoredFile'>()

  private readonly schema: FormSchema

  constructor(schema: FormSchema) {
    this.schema = schema
  }

  /** One line or more per field, in document order, at `depth` levels of indent. */
  members(fields: readonly FieldDef[], depth: number): string[] {
    const indent = '  '.repeat(depth)
    const lines: string[] = []
    for (const field of fields) {
      const { shape, nullable } = ANSWER_KINDS[field.type]
      if (shape === 'page') {
        lines.push(...this.members(field.fields ?? [], depth))
        continue
      }
      if (shape === 'nothing') continue

      lines.push(...this.describe(field, indent))
      const key = `${indent}${property(field.key)}?: `
      if (shape === 'group') {
        lines.push(`${key}{`, ...this.members(field.fields ?? [], depth + 1), `${indent}}`)
      } else if (shape === 'rows') {
        lines.push(
          `${key}Array<{`,
          `${indent}  ${ROW_ID}: string`,
          ...this.members(field.fields ?? [], depth + 1),
          `${indent}}>`,
        )
      } else {
        lines.push(`${key}${this.answer(field)}${nullable ? ' | null' : ''}`)
      }
    }
    return lines
  }

  /** The type of one answer, without the `null` that `nullable` adds. */
  private answer(field: FieldDef): string {
    switch (ANSWER_KINDS[field.type].shape) {
      case 'number':
        return 'number'
      case 'boolean':
        return 'boolean'
      case 'choice':
        return offered(field.options)
      case 'choices':
        return `Array<${offered(field.options)}>`
      case 'matrix': {
        const value = offered(field.options)
        const rows = (field.rows ?? []).map((row) => `${property(row.value)}?: ${value}`)
        return rows.length === 0 ? `Record<string, ${value}>` : `{ ${rows.join('; ')} }`
      }
      case 'files':
        this.imports.add('StoredFile')
        return 'StoredFile[]'
      case 'signature':
        this.imports.add('SignatureAnswer')
        return 'SignatureAnswer'
      default:
        return 'string'
    }
  }

  /** The field's label, in the form's default language, and a temporal answer's form. */
  private describe(field: FieldDef, indent: string): string[] {
    const label = resolveText(this.schema, field.label, this.schema.i18n?.defaultLocale ?? '')
    const temporal = TEMPORAL_FORMS[field.type as TemporalFieldType] as string | undefined
    const text = [label, temporal].filter((part) => part !== undefined && part !== '').join(': ')
    if (text === '') return []
    return [`${indent}/** ${text.replaceAll('*/', '*\\/').replace(/\s+/g, ' ')} */`]
  }
}

/** The offered values as a union of literals, or any string when the document lists none. */
function offered(options: readonly FieldOption[] | undefined): string {
  if (options === undefined || options.length === 0) return 'string'
  return options.map((option) => JSON.stringify(option.value)).join(' | ')
}

/** A key as an object type writes it: bare when it is an identifier, quoted when not. */
function property(key: string): string {
  return IDENTIFIER.test(key) ? key : JSON.stringify(key)
}

/** A `//` comment, wrapped to the width the repository writes. */
function comment(text: string): string[] {
  return wrap(text, '// ')
}

function wrap(text: string, prefix: string, width = 100): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    if (line !== '' && prefix.length + line.length + 1 + word.length > width) {
      lines.push(prefix + line)
      line = word
    } else {
      line = line === '' ? word : `${line} ${word}`
    }
  }
  if (line !== '') lines.push(prefix + line)
  return lines
}
