import { describe, expect, test } from 'vitest'
import { ANSWER_KINDS, FIELD_TYPES } from '@formancy/spec'
import type { FieldDef, FormSchema } from '@formancy/spec'
import { createFormEngine } from './engine.js'

/**
 * Every answer has the shape its type says, or the engine refuses it (0189).
 *
 * The replay ([0030](../../../docs/decisions/0030-never-trust-client-state.md)) checked a
 * value's shape only where a constraint happened to read it: a `number` with no `min`,
 * `max` or `step`, a `text` with no length, pattern, format or mask, and every `hidden`,
 * `richtext` and optional `checkbox` were stored as whatever was posted. So `{"name":
 * {"$gt": ""}}` went into the database as an object, and nothing reading a submission
 * could say what type an answer had without checking it again.
 */

const capabilities = { now: () => 0, today: () => '2026-01-01', random: () => 0.5 }

function schemaOf(fields: FieldDef[], rules: NonNullable<FormSchema['logic']>['rules'] = []): FormSchema {
  return { specVersion: '4', id: 'shapes', title: 'Shapes', model: { fields }, ...(rules.length > 0 ? { logic: { rules } } : {}) }
}

function errorsFor(field: FieldDef, value: unknown): string[] | undefined {
  const engine = createFormEngine({ schema: schemaOf([field]), initialValue: { [field.key]: value } })
  return engine.validate().errors[field.key]
}

const box: [number, number] = [100, 50]
const options = [
  { value: 'a', label: 'A' },
  { value: 'b', label: 'B' },
]

/** One field of each answering type, unconstrained, so only its shape is checked. */
const answering: Record<string, { def: FieldDef; fits: unknown; wrong: unknown }> = {
  text: { def: { key: 'x', type: 'text' }, fits: 'Ada', wrong: { $gt: '' } },
  textarea: { def: { key: 'x', type: 'textarea' }, fits: 'two\nlines', wrong: 42 },
  richtext: { def: { key: 'x', type: 'richtext' }, fits: '**bold**', wrong: ['**bold**'] },
  hidden: { def: { key: 'x', type: 'hidden' }, fits: 'campaign-7', wrong: true },
  number: { def: { key: 'x', type: 'number' }, fits: 4.5, wrong: '4.5' },
  checkbox: { def: { key: 'x', type: 'checkbox' }, fits: false, wrong: 'yes' },
  date: { def: { key: 'x', type: 'date' }, fits: '2026-10-26', wrong: 20261026 },
  time: { def: { key: 'x', type: 'time' }, fits: '09:30', wrong: 930 },
  datetime: { def: { key: 'x', type: 'datetime' }, fits: '2026-10-26T09:30:00Z', wrong: 0 },
  select: { def: { key: 'x', type: 'select', options }, fits: 'a', wrong: ['a'] },
  radio: { def: { key: 'x', type: 'radio', options }, fits: 'b', wrong: 1 },
  selectboxes: { def: { key: 'x', type: 'selectboxes', options }, fits: ['a'], wrong: 'a' },
  ranking: { def: { key: 'x', type: 'ranking', options }, fits: ['b', 'a'], wrong: { 0: 'b' } },
  matrix: {
    def: { key: 'x', type: 'matrix', options, rows: [{ value: 'r', label: 'R' }] },
    fits: { r: 'a' },
    wrong: ['a'],
  },
  file: {
    def: { key: 'x', type: 'file' },
    fits: [{ id: 'f1', name: 'a.pdf', size: 3, contentType: 'application/pdf', storageKey: 'k' }],
    wrong: 'a.pdf',
  },
  signature: { def: { key: 'x', type: 'signature', box }, fits: { typed: 'Ada Lovelace' }, wrong: 'Ada' },
}

describe('an answer of the wrong shape is refused, for every type', () => {
  // The table and this list must cover the same types, or a type added to the format
  // would be checked by nothing here.
  test('every answering type is exercised', () => {
    const answers = FIELD_TYPES.filter((type) => !['static', 'group', 'page', 'repeater'].includes(type))
    expect(Object.keys(answering).sort()).toEqual([...answers].sort())
  })

  // An object stored where a string belongs is the hostile-payload path: a later reader
  // comparing, exporting or rendering it gets something no control could have produced.
  test.each(Object.entries(answering))('%s', (_, { def, fits, wrong }) => {
    expect(errorsFor(def, fits)).toBeUndefined()
    expect(errorsFor(def, wrong)).toEqual(['type'])
  })
})

describe('null is unanswered for one answer, and never for a list', () => {
  const nullable = ['text', 'textarea', 'richtext', 'hidden', 'number', 'checkbox', 'date', 'time', 'datetime', 'select', 'radio', 'signature']

  // A control that is cleared writes null, so null has to stay a way to say "nothing" —
  // refusing it would refuse every form somebody typed into and then emptied.
  test.each(nullable)('%s accepts null', (type) => {
    expect(errorsFor(answering[type]!.def, null)).toBeUndefined()
  })

  // An empty list is `[]`, never null (types.ts). A null where a list belongs is a value no
  // control writes, and `'a' in topics` is an error against it rather than false.
  test.each(['selectboxes', 'ranking', 'matrix', 'file'])('%s refuses null', (type) => {
    expect(errorsFor(answering[type]!.def, null)).toEqual(['type'])
  })

  test('the table says the same thing', () => {
    expect(nullable.every((type) => ANSWER_KINDS[type as keyof typeof ANSWER_KINDS].nullable)).toBe(true)
  })
})

describe('an empty string is an answer only where the answer is text', () => {
  // A renderer writes null for a cleared number, date or choice. `''` there is a value
  // no control produces, and the type would have to admit it for every reader.
  test.each(['number', 'date', 'time', 'datetime', 'select', 'radio'])('%s refuses ""', (type) => {
    expect(errorsFor(answering[type]!.def, '')).toEqual(['type'])
  })

  test.each(['text', 'textarea', 'richtext', 'hidden'])('%s keeps "" as unanswered', (type) => {
    expect(errorsFor(answering[type]!.def, '')).toBeUndefined()
  })
})

describe('a number is a finite number', () => {
  // `NaN` and the infinities cannot arrive as JSON, but a host's prefill can hand one
  // over, and a bound compared against NaN is vacuously satisfied.
  test.each([Number.NaN, Number.POSITIVE_INFINITY])('%s is refused', (value) => {
    expect(errorsFor({ key: 'x', type: 'number' }, value)).toEqual(['type'])
  })
})

describe('a group holds an object', () => {
  const schema = schemaOf([
    { key: 'address', type: 'group', fields: [{ key: 'street', type: 'text' }] },
    {
      key: 'items',
      type: 'repeater',
      fields: [{ key: 'where', type: 'group', fields: [{ key: 'room', type: 'text' }] }],
    },
  ])
  const errorsOf = (initialValue: Record<string, unknown>): Record<string, string[]> =>
    createFormEngine({ schema, initialValue }).validate().errors

  // A group is not a field the engine visits, so its own value was checked by nothing: a
  // string posted where the object belongs was stored, and every reader of `address.street`
  // met a string where an object was promised. Found by compiling stored values against the
  // type a form's submissions are given.
  test.each([['Main'], [['Main']], [null]])('%o in place of one is refused', (value) => {
    expect(errorsOf({ address: value })).toEqual({ address: ['type'] })
  })

  test('so is one in a row', () => {
    expect(errorsOf({ items: [{ _id: 'r1', where: 'kitchen' }] })).toEqual({ 'items[0].where': ['type'] })
  })

  test('an object, an empty one, or none at all is fine', () => {
    expect(errorsOf({ address: { street: 'Main' } })).toEqual({})
    expect(errorsOf({ address: {} })).toEqual({})
    expect(errorsOf({})).toEqual({})
  })

  // A hidden group is not part of the conversation, but a group a rule hides and keeps
  // (`clearOnHide: false`) is still stored, so what it holds has to be what a group holds.
  test('a hidden group that keeps its value still holds an object', () => {
    const hidden = createFormEngine({
      schema: {
        ...schemaOf([{ key: 'address', type: 'group', clearOnHide: false, fields: [{ key: 'street', type: 'text' }] }]),
        logic: { rules: [{ kind: 'visible', target: 'address', cel: 'false' }] },
      },
      capabilities,
      initialValue: { address: 'Main' },
    })
    expect(hidden.validate().errors).toEqual({ address: ['type'] })
  })
})

describe('a field a rule hides and keeps still has its shape', () => {
  // A hidden field is not validated — it is not part of the conversation — but one whose
  // `clearOnHide` is false keeps its value, and that value is stored. Measured before this:
  // an object posted for such a text field was stored with `submit()` reporting ok.
  const kept = (fields: FieldDef[], initialValue: Record<string, unknown>) =>
    createFormEngine({
      schema: {
        ...schemaOf([{ key: 'gate', type: 'checkbox' }, ...fields]),
        logic: { rules: fields.map((field) => ({ kind: 'visible' as const, target: field.key, cel: 'gate == true' })) },
      },
      capabilities,
      mode: 'server',
      initialValue: { gate: false, ...initialValue },
    }).submit()

  test('an answer of the wrong shape is refused, and nothing else is asked of it', () => {
    expect(kept([{ key: 'note', type: 'text', clearOnHide: false, required: true }], { note: { $gt: '' } })).toEqual({
      ok: false,
      errors: { note: ['type'] },
    })
    // Required, and empty: a hidden field is still not asked to be answered.
    expect(kept([{ key: 'note', type: 'text', clearOnHide: false, required: true, minLength: 5 }], { note: 'ab' })).toEqual({
      ok: true,
      errors: {},
    })
  })

  test('so is a repeater that keeps something other than rows', () => {
    expect(
      kept([{ key: 'items', type: 'repeater', clearOnHide: false, fields: [{ key: 'qty', type: 'number' }] }], { items: 'rows' }),
    ).toEqual({ ok: false, errors: { items: ['type'] } })
  })

  test('and a field inside a group a rule hid', () => {
    expect(
      kept([{ key: 'address', type: 'group', clearOnHide: false, fields: [{ key: 'zip', type: 'number' }] }], { address: { zip: '8000' } }),
    ).toEqual({ ok: false, errors: { 'address.zip': ['type'] } })
  })
})

describe('a static field collects nothing', () => {
  const schema = schemaOf([
    { key: 'note', type: 'static', label: 'Read this' },
    { key: 'name', type: 'text' },
  ])

  // A value posted for a field with no answer was stored as though somebody had answered
  // it, and every reader of the submission would have to know to ignore it.
  test('a value handed in for one is dropped', () => {
    const engine = createFormEngine({ schema, initialValue: { note: 'injected', name: 'Ada' } })
    expect(engine.value()).toEqual({ name: 'Ada' })
  })

  test('a value set on one does not take', () => {
    const engine = createFormEngine({ schema })
    engine.setValue(['note'], 'typed')
    expect(engine.value()).toEqual({})
  })
})

describe('a computed value is stored only in the shape of the field it fills', () => {
  // Measured before this: `42.0` computed into a text field stored the number 42, and
  // `submit()` said ok — a text answer that was not text.
  test('a result of the wrong shape is not written', () => {
    const schema = schemaOf([{ key: 'note', type: 'text' }], [{ kind: 'computed', target: 'note', cel: '42.0' }])
    const engine = createFormEngine({ schema, capabilities })
    expect(engine.value()).toEqual({})
  })

  // Measured before this: `dec("19.90") * dec("2")` stored a `Decimal`, and
  // `JSON.stringify` on the form's value threw "Do not know how to serialize a BigInt" — a
  // documented money calculation that could not be submitted.
  test('a decimal into a number field is stored as the number it writes', () => {
    const schema = schemaOf(
      [{ key: 'total', type: 'number' }],
      [{ kind: 'computed', target: 'total', cel: 'dec("19.90") * dec("2")' }],
    )
    const engine = createFormEngine({ schema, capabilities })
    expect(engine.value()).toEqual({ total: 39.8 })
    expect(JSON.stringify(engine.value())).toBe('{"total":39.8}')
  })

  // A double cannot hold every decimal. One it cannot hold exactly is not written rather
  // than rounded, because a money total that is off by a cent is the reason the decimal
  // type exists.
  test('a decimal no number holds exactly is not written', () => {
    const schema = schemaOf(
      [{ key: 'total', type: 'number' }],
      [{ kind: 'computed', target: 'total', cel: 'dec("1234567890.123456789")' }],
    )
    const engine = createFormEngine({ schema, capabilities })
    expect(engine.value()).toEqual({})
  })

  test('the same holds in every row', () => {
    const schema = schemaOf(
      [{ key: 'items', type: 'repeater', fields: [{ key: 'note', type: 'text' }, { key: 'total', type: 'number' }] }],
      [
        { kind: 'computed', target: 'items[].note', cel: '1.0' },
        { kind: 'computed', target: 'items[].total', cel: 'dec("2.50")' },
      ],
    )
    const engine = createFormEngine({ schema, capabilities, initialValue: { items: [{ _id: 'r1' }] } })
    expect(engine.value()).toEqual({ items: [{ _id: 'r1', total: 2.5 }] })
  })
})
