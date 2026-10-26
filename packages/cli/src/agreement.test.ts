import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, test } from 'vitest'
import { createFormEngine } from '@formancy/core'
import { answersTypeScript } from '@formancy/spec'
import type { FieldDef, FormSchema } from '@formancy/spec'

/**
 * The printed type and the engine agree (0190).
 *
 * Both read `ANSWER_KINDS`, but each reads it through code of its own, and a printer that
 * wrote `number` for a field the engine stores as a string would pass every test that looked
 * at one of them. So the two are put against each other, value by value: what the engine
 * keeps is compiled against the printed type and must compile; what it refuses for its
 * shape, its option or its row must not.
 *
 * **What the engine keeps, not what was sent.** A row handed in without `_id` is given one,
 * and a `static` field's value is dropped, so the type describes `engine.value()` — what a
 * submission stores — and that is what is compiled.
 *
 * **One deliberate gap, named below.** A type has no spelling for "a non-empty string", so
 * `''` for a date, a time or a choice with no listed options compiles although the engine
 * refuses it. The type is wider than the data there, which is the safe direction for a
 * reader: it prepares them for a value that never arrives, never the reverse.
 */

const fields: FieldDef[] = [
  { key: 'text', type: 'text' },
  { key: 'textarea', type: 'textarea' },
  { key: 'richtext', type: 'richtext' },
  { key: 'hidden', type: 'hidden' },
  { key: 'number', type: 'number' },
  { key: 'checkbox', type: 'checkbox' },
  { key: 'date', type: 'date' },
  { key: 'time', type: 'time' },
  { key: 'datetime', type: 'datetime' },
  { key: 'select', type: 'select', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] },
  { key: 'radio', type: 'radio', options: [{ value: 'a', label: 'A' }] },
  { key: 'sourced', type: 'select', optionsSource: 'cantons' },
  { key: 'selectboxes', type: 'selectboxes', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] },
  { key: 'ranking', type: 'ranking', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] },
  {
    key: 'matrix',
    type: 'matrix',
    rows: [{ value: 'taste', label: 'Taste' }],
    options: [{ value: 'good', label: 'Good' }, { value: 'bad', label: 'Bad' }],
  },
  { key: 'file', type: 'file' },
  { key: 'signature', type: 'signature', box: [100, 50] },
  { key: 'note', type: 'static', label: 'Read me' },
  { key: 'address', type: 'group', fields: [{ key: 'street', type: 'text' }, { key: 'zip', type: 'number' }] },
  { key: 'items', type: 'repeater', fields: [{ key: 'qty', type: 'number' }] },
]

const schema: FormSchema = { specVersion: '4', id: 'agreement', title: 'Agreement', model: { fields } }

const stored = { id: 'f1', name: 'a.pdf', size: 3, contentType: 'application/pdf', storageKey: 'k' }

/** Answers the engine keeps, and answers it refuses, per field. */
const cases: Array<[key: string, kept: unknown[], refused: unknown[]]> = [
  ['text', ['Ada', '', null], [42, { $gt: '' }, ['Ada']]],
  ['textarea', ['two\nlines', null], [true]],
  ['richtext', ['**bold**', null], [{ text: 'bold' }]],
  ['hidden', ['campaign-7', null], [7]],
  ['number', [4.5, 0, null], ['4.5', '', true]],
  ['checkbox', [true, false, null], ['yes', 1]],
  ['date', ['2026-10-26', null], [20261026]],
  ['time', ['09:30', null], [930]],
  ['datetime', ['2026-10-26T09:30:00Z', null], [0]],
  ['select', ['a', null], ['z', '', ['a'], 1]],
  ['radio', ['a', null], ['b', true]],
  ['sourced', ['anything at all', null], [5, ['a']]],
  ['selectboxes', [['a'], ['a', 'b'], []], [null, 'a', ['z'], [1]]],
  ['ranking', [['b', 'a'], []], [null, ['z'], [1]]],
  ['matrix', [{ taste: 'good' }, {}], [null, { taste: 'great' }, { price: 'good' }, ['good']]],
  ['file', [[stored], []], [null, ['a.pdf'], 'a.pdf']],
  ['signature', [{ typed: 'Ada' }, { drawn: [[[1, 2], [3, 4]]] }, null], ['Ada', { typed: 'Ada', drawn: [] }]],
  ['address', [{ street: 'Main', zip: 8000 }, {}], ['Main', [{ street: 'Main' }], { zip: '8000' }]],
  // A row handed in without `_id` is given one, so it is kept — and stored with it.
  ['items', [[{ _id: 'r1', qty: 2 }], [{ qty: 2 }], []], ['rows', [{ _id: 'r1', qty: 'two' }]]],
]

/** Accepted by the type and refused by the engine, because a type cannot say "non-empty". */
const wider: Array<[key: string, value: unknown]> = [
  ['date', ''],
  ['time', ''],
  ['datetime', ''],
  ['sourced', ''],
]

/** The codes that are about what an answer IS, which a type can describe; `min` is not. */
const TYPE_LEVEL = new Set(['type', 'option', 'row'])

function engineOn(data: Record<string, unknown>) {
  const engine = createFormEngine({ schema, initialValue: data })
  const errors = engine.validate().errors
  const refused = Object.entries(errors).some(([, codes]) => codes.some((code) => TYPE_LEVEL.has(code)))
  return { refused, kept: engine.value() }
}

/**
 * Compiles each value against the printed type and answers, per value, whether it compiled.
 *
 * The printed module imports `StoredFile` and `SignatureAnswer` from `@formancy/spec`, and
 * the virtual files sit in this package's own directory, so that import resolves to the
 * built spec exactly as it would in a consumer's project.
 */
function compiles(values: unknown[]): boolean[] {
  const here = dirname(fileURLToPath(import.meta.url))
  const answersFile = join(here, '__agreement_answers.ts')
  const casesFile = join(here, '__agreement_cases.ts')
  const sources = new Map([
    [answersFile, answersTypeScript(schema, { name: 'Answers' })],
    [
      casesFile,
      [
        "import type { Answers } from './__agreement_answers.js'",
        ...values.map((value, index) => `export const case${String(index)}: Answers = ${JSON.stringify(value)}`),
      ].join('\n'),
    ],
  ])
  const options: ts.CompilerOptions = {
    strict: true,
    exactOptionalPropertyTypes: true,
    noEmit: true,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    target: ts.ScriptTarget.ES2022,
    types: [],
    // The language's own library and no DOM, and its declarations not re-checked: what is on
    // trial is the printed type, and under coverage on a shared CI runner the full library
    // made each compile take most of a minute.
    lib: ['lib.es2022.d.ts'],
    skipLibCheck: true,
  }
  const host = ts.createCompilerHost(options)
  const readFile = host.readFile.bind(host)
  const fileExists = host.fileExists.bind(host)
  const getSourceFile = host.getSourceFile.bind(host)
  host.readFile = (file) => sources.get(file) ?? readFile(file)
  host.fileExists = (file) => sources.has(file) || fileExists(file)
  host.getSourceFile = (file, language) =>
    sources.has(file) ? ts.createSourceFile(file, sources.get(file)!, language) : getSourceFile(file, language)

  const program = ts.createProgram([answersFile, casesFile], options, host)
  const elsewhere = ts.getPreEmitDiagnostics(program).filter((diagnostic) => diagnostic.file?.fileName !== casesFile)
  // A broken printed module, or an import that did not resolve, would make every case fail
  // to compile for a reason that has nothing to do with the case.
  expect(elsewhere.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))).toEqual([])

  const failing = new Set(
    ts
      .getPreEmitDiagnostics(program)
      .filter((diagnostic) => diagnostic.file?.fileName === casesFile && diagnostic.start !== undefined)
      .map((diagnostic) => diagnostic.file!.getLineAndCharacterOfPosition(diagnostic.start!).line - 1),
  )
  return values.map((_, index) => !failing.has(index))
}

describe('the printed type and the engine agree', () => {
  const kept = cases.flatMap(([key, values]) => values.map((value) => ({ key, value })))
  const refused = cases.flatMap(([key, , values]) => values.map((value) => ({ key, value })))
  const whole = createFormEngine({
    schema,
    initialValue: Object.fromEntries(cases.map(([key, values]) => [key, values[0]])),
  })

  /**
   * Every value the tests below ask about, compiled in one program, once: a program per test
   * paid for the compiler four times over, which on a shared runner under coverage was the
   * difference between seconds and a timeout.
   */
  const verdicts = (() => {
    let cached: { kept: boolean[]; refused: boolean[]; wider: boolean[]; whole: boolean } | undefined
    return () => {
      if (cached !== undefined) return cached
      const keptValues = kept.map(({ key, value }) => engineOn({ [key]: value }).kept)
      const refusedValues = refused.map(({ key, value }) => ({ [key]: value }))
      const widerValues = wider.map(([key, value]) => ({ [key]: value }))
      const all = compiles([...keptValues, ...refusedValues, ...widerValues, whole.value()])
      let at = 0
      const take = (count: number): boolean[] => all.slice(at, (at += count))
      cached = { kept: take(keptValues.length), refused: take(refusedValues.length), wider: take(widerValues.length), whole: take(1)[0]! }
      return cached
    }
  })()

  // Guards the list itself: a case the engine did not actually treat as described would make
  // the comparison below a comparison with a wrong premise.
  test('the engine keeps and refuses what the cases say', () => {
    expect(kept.filter(({ key, value }) => engineOn({ [key]: value }).refused)).toEqual([])
    expect(refused.filter(({ key, value }) => !engineOn({ [key]: value }).refused)).toEqual([])
    expect(wider.filter(([key, value]) => !engineOn({ [key]: value }).refused)).toEqual([])
  })

  // The direction a consumer depends on: a stored submission that did not compile against its
  // own form's type would make the type a lie about real data.
  test('everything the engine keeps compiles, as it is stored', () => {
    expect(kept.filter((_, index) => !verdicts().kept[index])).toEqual([])
  })

  test('everything the engine refuses for what it is does not compile', () => {
    expect(refused.filter((_, index) => verdicts().refused[index])).toEqual([])
  })

  // Pinned rather than tolerated: if a later TypeScript or a later printer closes the gap,
  // this fails and the comment above stops being true.
  test("the one gap: '' where the engine wants a non-empty string", () => {
    expect(verdicts().wider).toEqual(wider.map(() => true))
  })

  test('a whole submission compiles', () => {
    expect(whole.validate().valid).toBe(true)
    expect(verdicts().whole).toBe(true)
  })
})
