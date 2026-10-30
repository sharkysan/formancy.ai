import { describe, expect, test } from 'vitest'
import { answersTypeScript, answersTypeName } from './answers-typescript.js'
import { schemaHash } from './hash.js'
import type { FormSchema } from './types.js'

/**
 * The type a form's submissions are given, printed from `ANSWER_KINDS` (0190).
 *
 * These cases pin what the printer writes. Whether what it writes AGREES with what the
 * engine accepts is a different question with a different test —
 * `packages/cli/src/agreement.test.ts` compiles values the engine accepts and refuses
 * against the printed type — because a printer that matched its own expectations here
 * and disagreed with the engine would pass every case in this file.
 */

const contact: FormSchema = {
  specVersion: '4',
  id: 'contact-us',
  title: 'Contact us',
  model: {
    fields: [
      { key: 'name', type: 'text', label: 'Your name', required: true },
      {
        key: 'country',
        type: 'select',
        label: 'Country',
        options: [
          { value: 'CH', label: 'Switzerland' },
          { value: 'DE', label: 'Germany' },
        ],
      },
      { key: 'note', type: 'static', label: 'We answer within a day.' },
    ],
  },
}

describe('the type of a form’s answers', () => {
  // The whole output once, so a change to the printer's shape is a change somebody reads.
  test('is a module exporting one interface, named after the form', () => {
    expect(answersTypeScript(contact)).toBe(
      [
        '// What a submission of "Contact us" holds: generated from the form by formancy. Do not edit;',
        '// generate it again when the form changes. Form "contact-us", spec version 4, schema hash',
        `// ${schemaHash(contact)}.`,
        '',
        '/**',
        ' * The answers to "Contact us". Every key may be absent: an unanswered field has no key, a rule may',
        ' * hide any field and take its answer with it, and `required` promises an answer only for a field',
        ' * that is shown.',
        ' */',
        'export interface ContactUsAnswers {',
        '  /** Your name */',
        '  name?: string | null',
        '  /** Country */',
        '  country?: "CH" | "DE" | null',
        '}',
        '',
      ].join('\n'),
    )
  })

  // A static field collects nothing (0189), so a key for it would promise an answer that
  // the engine drops.
  test('has no key for a field that collects nothing', () => {
    expect(answersTypeScript(contact)).not.toContain('note')
  })
})

describe('each shape', () => {
  const typeOf = (field: FormSchema['model']['fields'][number]): string => {
    const printed = answersTypeScript({ specVersion: '4', id: 'f', title: 'F', model: { fields: [field] } })
    return printed.slice(printed.indexOf('{\n') + 2, printed.lastIndexOf('\n}')).trim()
  }

  test.each([
    [{ key: 'a', type: 'textarea' }, 'a?: string | null'],
    [{ key: 'a', type: 'richtext' }, 'a?: string | null'],
    [{ key: 'a', type: 'hidden' }, 'a?: string | null'],
    [{ key: 'a', type: 'number' }, 'a?: number | null'],
    [{ key: 'a', type: 'checkbox' }, 'a?: boolean | null'],
    // A choice with no options of its own is any string: the list lives elsewhere.
    [{ key: 'a', type: 'select', optionsSource: 'cantons' }, 'a?: string | null'],
    [{ key: 'a', type: 'selectboxes', options: [{ value: 'x', label: 'X' }] }, 'a?: Array<"x">'],
    [
      {
        key: 'a',
        type: 'ranking',
        options: [
          { value: 'x', label: 'X' },
          { value: 'y', label: 'Y' },
        ],
      },
      'a?: Array<"x" | "y">',
    ],
  ] as const)('%o', (field, expected) => {
    expect(typeOf(field as never)).toBe(expected)
  })

  test('a temporal answer says its form', () => {
    expect(typeOf({ key: 'a', type: 'date' })).toBe('/** `YYYY-MM-DD` */\n  a?: string | null')
    expect(typeOf({ key: 'a', type: 'time' })).toBe('/** `HH:MM`, a wall clock with no zone */\n  a?: string | null')
    expect(typeOf({ key: 'a', type: 'datetime' })).toBe('/** `YYYY-MM-DDTHH:MM:SSZ`, an instant in UTC */\n  a?: string | null')
  })

  test('a matrix maps each of its rows to an offered value', () => {
    expect(
      typeOf({
        key: 'a',
        type: 'matrix',
        rows: [
          { value: 'taste', label: 'Taste' },
          { value: 'price-level', label: 'Price' },
        ],
        options: [
          { value: 'good', label: 'Good' },
          { value: 'bad', label: 'Bad' },
        ],
      }),
    ).toBe('a?: { taste?: "good" | "bad"; "price-level"?: "good" | "bad" }')
  })

  // Imported rather than spelled out, so the printed type and the format cannot describe a
  // file or a signature two ways.
  test('files and a signature are the format’s own types', () => {
    const printed = answersTypeScript({
      specVersion: '4',
      id: 'f',
      title: 'F',
      model: {
        fields: [
          { key: 'proof', type: 'file' },
          { key: 'sign', type: 'signature', box: [10, 10] },
        ],
      },
    })
    expect(printed).toContain("import type { SignatureAnswer, StoredFile } from '@formancy/spec'")
    expect(printed).toContain('  proof?: StoredFile[]')
    expect(printed).toContain('  sign?: SignatureAnswer | null')
    expect(answersTypeScript(contact)).not.toContain('import')
  })

  test('a group nests, a page does not, and a row carries its identity', () => {
    const printed = answersTypeScript({
      specVersion: '4',
      id: 'f',
      title: 'F',
      model: {
        fields: [
          {
            key: 'one',
            type: 'page',
            fields: [
              { key: 'address', type: 'group', fields: [{ key: 'street', type: 'text' }] },
              { key: 'items', type: 'repeater', fields: [{ key: 'qty', type: 'number' }] },
            ],
          },
        ],
      },
    })
    expect(printed).toContain(
      ['  address?: {', '    street?: string | null', '  }', '  items?: Array<{', '    _id: string', '    qty?: number | null', '  }>'].join('\n'),
    )
    expect(printed).not.toContain('one?')
  })
})

describe('what it is called', () => {
  test('the form’s id in PascalCase, then Answers', () => {
    expect(answersTypeName('contact-us')).toBe('ContactUsAnswers')
    expect(answersTypeName('patient_registration.v2')).toBe('PatientRegistrationV2Answers')
  })

  // An identifier cannot start with a digit, and `2026-survey` is a valid form id.
  test('a form id starting with a digit is prefixed', () => {
    expect(answersTypeName('2026-survey')).toBe('Form2026SurveyAnswers')
  })

  test('a name asked for is used, and refused when it is not an identifier', () => {
    expect(answersTypeScript(contact, { name: 'Contact' })).toContain('export interface Contact {')
    expect(() => answersTypeScript(contact, { name: 'not a name' })).toThrow(/not a TypeScript identifier/)
  })

  // A label ending the comment early would end the generated file's doc comment and turn the
  // rest of the label into code.
  test('a label cannot close the comment it is written into', () => {
    const printed = answersTypeScript({
      specVersion: '4',
      id: 'f',
      title: 'F',
      model: { fields: [{ key: 'a', type: 'text', label: 'Ends */ here' }] },
    })
    expect(printed).toContain('/** Ends *\\/ here */')
  })
})
