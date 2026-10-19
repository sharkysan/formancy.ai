import { describe, expect, test } from 'vitest'
import type { FormSchema } from '@formancy/spec'
import { createFormEngine } from './engine.js'
import { formatPath, parsePath } from './path.js'
import { stripPaths } from './strip.js'
import { getAt, setAt } from './value.js'

/**
 * A key names an answer, and an answer is what the value holds as its own.
 *
 * Found on 2026-10-18, behind CodeQL's alerts 30 and 31 on `value.ts`, and in `getAt` since
 * the first commit: a path was walked with `value[segment]`, which reads what every object
 * inherits as readily as what it holds. The spec admits `constructor`, `toString`, `valueOf`
 * and `hasOwnProperty` as keys, so a required field keyed `constructor` counted as answered
 * by `function Object` — an empty submission was stored where the key `contractor` was
 * refused — and the renderer was handed that function as the field's value. And `__proto__`
 * is no key at all: written, it replaces the object's prototype, so a field keyed with it
 * lost every answer it was given.
 */

const CLOCK = { now: () => 0, today: () => '2026-10-18', random: () => 0.5 }

/** Every name a plain object answers without holding it, as a key's pattern admits them. */
const INHERITED = ['constructor', 'toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf'] as const

function form(fields: readonly unknown[], rules: readonly unknown[] = []): FormSchema {
  return {
    specVersion: '4',
    id: 'own',
    title: 'Own',
    model: { fields },
    ...(rules.length === 0 ? {} : { logic: { rules } }),
  } as FormSchema
}

/**
 * Something else on the page put `name` on a prototype — an old polyfill, a library that
 * extends the built-ins. Not enumerable, as such members usually are not, so nothing but a
 * read through inheritance can see it; taken off again whatever the case does.
 */
function withInherited(name: string, value: unknown, run: () => void, on: object = Object.prototype): void {
  Object.defineProperty(on, name, { value, configurable: true, writable: true, enumerable: false })
  try {
    run()
  } finally {
    delete (on as Record<string, unknown>)[name]
  }
}

describe('a key every object inherits is no answer', () => {
  test.each([...INHERITED, '__proto__'])('getAt reads nothing at "%s" in a value that does not hold it', (key) => {
    // The defect itself: `function Object`, `Object.prototype` and the rest came back as the
    // answer to a question nobody had answered, at the top and inside a group alike.
    expect(getAt({}, [key])).toBeUndefined()
    expect(getAt({ address: {} }, ['address', key])).toBeUndefined()
  })

  test.each(INHERITED)('and still reads the answer a value holds at "%s"', (key) => {
    // The half that keeps the fix from reading nothing at all: these are legal keys, and a
    // person who answered one answered it.
    expect(getAt({ [key]: 'ACME' }, [key])).toBe('ACME')
    expect(getAt({ address: { [key]: 'ACME' } }, ['address', key])).toBe('ACME')
  })

  test.each(INHERITED)('a required field keyed "%s" and left empty is refused as required', (key) => {
    // An anonymous POST of `{}` was stored with 201 for such a form, where the key
    // `contractor` was answered 422 — the server replays this engine, so this is that.
    const engine = createFormEngine({ schema: form([{ key, type: 'text', label: 'Contractor', required: true }]) })

    expect(engine.submit()).toEqual({ ok: false, errors: { [key]: ['required'] } })
  })

  test.each(INHERITED)('the snapshot of an unanswered field keyed "%s" holds no value', (key) => {
    // A renderer draws what the snapshot holds: it was handed the inherited function as the
    // answer, and the value of a text control is whatever it is handed.
    const engine = createFormEngine({ schema: form([{ key, type: 'text', label: 'Contractor' }]) })

    expect(engine.getFieldSnapshot([key]).value).toBeUndefined()
    expect(engine.value()).toEqual({})
  })

  test.each(INHERITED)('a rule reading an unanswered field keyed "%s" reads null, as for any other key', (key) => {
    // The expression was bound to the inherited function: `constructor == "yes"` could not
    // be evaluated, a visibility rule that errors fails open, and the field it was meant to
    // keep hidden until somebody said yes was shown from the start.
    const engine = createFormEngine({
      schema: form(
        [
          { key, type: 'text', label: 'Question' },
          { key: 'more', type: 'text', label: 'More' },
        ],
        [{ target: 'more', kind: 'visible', cel: `${key} == "yes"` }],
      ),
      capabilities: CLOCK,
    })

    expect(engine.getFieldSnapshot(['more']).visible).toBe(false)
    engine.setValue([key], 'yes')
    expect(engine.getFieldSnapshot(['more']).visible).toBe(true)
  })

  test.each(['constructor', 'toString', 'nowhere'])(
    'a check named "%s" that the deployment does not have is unavailable, as any other name is',
    async (check) => {
      // The deployment's checks were looked up the same way: `toString` answered the check
      // with "[object Undefined]" and `constructor` with the request itself — the whole
      // submission — and each was set on the field as its error code.
      const engine = createFormEngine({
        schema: form(
          [{ key: 'email', type: 'text', label: 'Email' }],
          [{ target: 'email', kind: 'check', check, runsOn: 'both' }],
        ),
        capabilities: CLOCK,
        checks: { 'email-not-taken': () => undefined },
      })
      engine.setValue(['email'], 'a@b.ch')
      await engine.settle()

      expect(engine.getFieldSnapshot(['email']).errors).toEqual(['check_unavailable'])
    },
  )

  test.each([...INHERITED, '__proto__'])('stripping "%s" from a value that does not hold it changes nothing', (key) => {
    // `key in value` said yes for every inherited name, so the value was copied to remove
    // what was not there, and a root that should have kept its identity lost it.
    const root = { name: 'Ann', address: { city: 'Zug' } }

    expect(stripPaths(root, [[key]])).toBe(root)
    expect(stripPaths(root, [['address', key]])).toBe(root)
  })

  test.each(INHERITED)('and stripping "%s" from a value that holds it still removes it', (key) => {
    // The premise: a hidden field keyed `constructor` leaves no trace of what it held.
    expect(stripPaths({ [key]: 'ACME', name: 'Ann' }, [[key]])).toEqual({ name: 'Ann' })
  })
})

describe('a list holds rows, and only rows', () => {
  test('getAt reads no key out of a list, its own `length` among them', () => {
    // `Object.hasOwn([], 'length')` is true, so a field keyed `length` in a group sent as a
    // list was answered by the list's length: `{ "address": [] }` was stored with 201 for a
    // form whose `address.length` is required.
    expect(getAt({ address: ['x'] }, ['address', 'length'])).toBeUndefined()
    expect(getAt(['x', 'y'], ['length'])).toBeUndefined()
  })

  test('and no index out of an object, as a write puts a key in an object and an index in a list', () => {
    // The read mirrors `write`, which replaces whatever it finds with the container the
    // segment names; a row read out of an object would be a row the engine holds no list of.
    expect(getAt({ rows: { 0: 'x' } }, ['rows', 0])).toBeUndefined()
    // The premises: an index out of a list, and a key spelled with digits out of an object.
    expect(getAt({ rows: ['x'] }, ['rows', 0])).toBe('x')
    expect(getAt({ rating: { '0': 'good' } }, ['rating', '0'])).toBe('good')
  })

  test.each([
    ['inside a group sent as a list', [{ key: 'address', type: 'group', label: 'Address', fields: [{ key: 'length', type: 'text', label: 'Length', required: true }] }], { address: [] }, 'address.length'],
    ['at the top of a submission sent as a list', [{ key: 'length', type: 'number', label: 'Length', required: true }], ['x', 'y'], 'length'],
  ])('a required field keyed length %s is refused as required', (_where, fields, initialValue, wire) => {
    // The server replays this engine over what was posted: a list answered the question with
    // its length, and was stored as the submission.
    const engine = createFormEngine({ schema: form(fields), mode: 'server', initialValue })

    expect(engine.submit()).toEqual({ ok: false, errors: { [wire]: ['required'] } })
  })
})

describe('a row or a group holding a member keyed constructor is read by its rules', () => {
  const items = {
    key: 'items',
    type: 'repeater',
    label: 'Items',
    fields: [
      { key: 'qty', type: 'number', label: 'Qty' },
      { key: 'total', type: 'number', label: 'Total' },
      { key: 'note', type: 'text', label: 'Note' },
      { key: 'constructor', type: 'text', label: 'Contractor' },
    ],
  }

  test.each([
    ['left unanswered', { qty: 2.5 }],
    ['answered', { qty: 2.5, constructor: 'ACME' }],
  ])('a row whose constructor is %s', (_how, row) => {
    // The row is bound with every member it declares, an unanswered one as null, and the
    // expression library tells a map by its `constructor`: a row holding one of its own was
    // no map to it. A good row was refused as invalid, a computed total was never stored,
    // and a visibility rule failed open and showed what it was meant to hide.
    const engine = createFormEngine({
      schema: form(
        [items],
        [
          { target: 'items[].qty', kind: 'validate', cel: 'item.qty > 0.0', message: 'positive' },
          { target: 'items[].total', kind: 'computed', cel: 'item.qty * 2.0' },
          { target: 'items[].note', kind: 'visible', cel: 'item.qty > 10.0' },
        ],
      ),
      capabilities: CLOCK,
      mode: 'server',
      initialValue: { items: [row] },
    })

    expect(engine.getFieldSnapshot(['items', 0, 'total']).value).toBe(5)
    expect(engine.getFieldSnapshot(['items', 0, 'note']).visible).toBe(false)
    expect(engine.submit().ok).toBe(true)
  })

  test('and a rule reads the member itself, as it reads any other', () => {
    // The member is a key like any other: null where nobody answered, the answer where
    // somebody did.
    const engine = createFormEngine({
      schema: form([items], [{ target: 'items[].note', kind: 'visible', cel: 'item.constructor == "ACME"' }]),
      capabilities: CLOCK,
      initialValue: { items: [{ qty: 1 }, { qty: 1, constructor: 'ACME' }] },
    })

    expect(engine.getFieldSnapshot(['items', 0, 'note']).visible).toBe(false)
    expect(engine.getFieldSnapshot(['items', 1, 'note']).visible).toBe(true)
  })

  test('a group whose constructor is answered is read by a rule on its other member', () => {
    // A group is bound as it was answered, so this one failed only once both were answered:
    // `site.city == "Zug"` could not be evaluated and showed the field it hides for Bern.
    const engine = createFormEngine({
      schema: form(
        [
          {
            key: 'site',
            type: 'group',
            label: 'Site',
            fields: [
              { key: 'city', type: 'text', label: 'City' },
              { key: 'constructor', type: 'text', label: 'Contractor' },
            ],
          },
          { key: 'more', type: 'text', label: 'More' },
        ],
        [{ target: 'more', kind: 'visible', cel: 'site.city == "Zug"' }],
      ),
      capabilities: CLOCK,
      initialValue: { site: { city: 'Bern', constructor: 'ACME' } },
    })

    expect(engine.getFieldSnapshot(['more']).visible).toBe(false)
  })
})

describe('a member somebody else put on every object is no answer either', () => {
  test('a write into a group the value does not hold starts the group empty', () => {
    // `write` recursed into `next[segment]`, so a group nobody had answered was spread from
    // whatever the prototype held under its key, and that went into the submission.
    withInherited('address', { city: 'Planted' }, () => {
      const next = setAt({}, ['address', 'zip'], '8000')

      expect(next).toEqual({ address: { zip: '8000' } })
      expect(Object.keys((next as { address: object }).address)).toEqual(['zip'])
    })
  })

  test('a write into a row the list does not hold starts the row empty', () => {
    // The same recursion for a row: a fresh list read its slot through `Array.prototype`.
    withInherited(
      '0',
      { name: 'Planted' },
      () => {
        expect(setAt({}, ['rows', 0, 'qty'], 1)).toEqual({ rows: [{ qty: 1 }] })
      },
      Array.prototype,
    )
  })

  test('a required matrix is not answered by a row the prototype holds', () => {
    // What counts as a matrix's answer read each row's column off the answer by name; a
    // planted string under a row's value answered that row, and the form was sent with it
    // unanswered.
    const engine = createFormEngine({
      schema: form([
        {
          key: 'rating',
          type: 'matrix',
          label: 'Rating',
          required: true,
          rows: [
            { value: 'taste', label: 'Taste' },
            { value: 'price', label: 'Price' },
          ],
          options: [
            { value: 'good', label: 'Good' },
            { value: 'bad', label: 'Bad' },
          ],
        },
      ]),
    })
    engine.setValue(['rating'], { price: 'good' })

    withInherited('taste', 'good', () => {
      expect(engine.submit()).toEqual({ ok: false, errors: { rating: ['required'] } })
    })
  })
})

describe('__proto__ names no path', () => {
  test.each([
    [['__proto__']],
    [['outer', '__proto__', 'total']],
    [['rows', 0, '__proto__']],
  ])('formatPath refuses %j', (path) => {
    // Written, `__proto__` sets the object's prototype rather than a member, so a path
    // through it is a path to no answer — a silent change of identity, which is what
    // formatPath already refuses a "." in a key for.
    expect(() => formatPath(path)).toThrow(/"__proto__"/)
  })

  test.each(['__proto__', 'outer.__proto__.total', 'rows[0].__proto__'])('parsePath refuses "%s"', (wire) => {
    // The other translation point, so a rule's target or a request naming the path is
    // refused where the engine would otherwise write through it.
    expect(() => parsePath(wire)).toThrow(/"__proto__"/)
  })

  test.each(['proto', '_proto_', 'prototype', 'constructor'])('and admits "%s", which an object holds as its own', (key) => {
    // The refusal is one name, not a pattern: anything else round-trips as it did.
    expect(parsePath(formatPath(['outer', key]))).toEqual(['outer', key])
  })

  test('the engine refuses a document with a field keyed __proto__ rather than losing its answers', () => {
    // Before, it opened: `{ name: 'Ann' }` came back from a write of "typed answer" under
    // `__proto__`, and a computed `outer.__proto__.total` showed on the snapshot and was
    // never stored. A document no validator saw reaches the engine as it is, so the
    // engine says so itself.
    const document = form([
      {
        key: 'outer',
        type: 'group',
        label: 'Outer',
        fields: [{ key: '__proto__', type: 'text', label: 'Remarks' }],
      },
    ])

    expect(() => createFormEngine({ schema: document })).toThrow(/"__proto__"/)
  })
})
