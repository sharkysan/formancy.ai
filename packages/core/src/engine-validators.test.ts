import { describe, expect, test } from 'vitest'
import type { FormSchema } from '@formancy/spec'
import { createFormEngine } from './engine.js'

const schema: FormSchema = {
  specVersion: '1',
  id: 'signup',
  title: 'Sign up',
  model: {
    fields: [
      { key: 'qty', type: 'number', min: 1, max: 100 },
      { key: 'name', type: 'text', minLength: 2, maxLength: 5 },
      { key: 'code', type: 'text', pattern: '[A-Z]{3}' },
      { key: 'email', type: 'text', format: 'email' },
      { key: 'site', type: 'text', format: 'url' },
      { key: 'ref', type: 'text', format: 'uuid' },
    ],
  },
}

function errorsFor(initialValue: Record<string, unknown>): Record<string, string[]> {
  const engine = createFormEngine({ schema, initialValue })
  return engine.validate().errors
}

describe('model validators', () => {
  test('an empty optional field trips NO validator — emptiness is required’s job alone', () => {
    expect(errorsFor({})).toEqual({})
    expect(errorsFor({ name: '', email: '' })).toEqual({})
  })

  test('numeric bounds', () => {
    expect(errorsFor({ qty: 0 })['qty']).toEqual(['min'])
    expect(errorsFor({ qty: 101 })['qty']).toEqual(['max'])
    expect(errorsFor({ qty: 50 })['qty']).toBeUndefined()
  })

  test('text length bounds', () => {
    expect(errorsFor({ name: 'a' })['name']).toEqual(['minLength'])
    expect(errorsFor({ name: 'abcdef' })['name']).toEqual(['maxLength'])
    expect(errorsFor({ name: 'abc' })['name']).toBeUndefined()
  })

  test('a pattern must match the WHOLE answer, not a substring', () => {
    expect(errorsFor({ code: 'ABC' })['code']).toBeUndefined()
    expect(errorsFor({ code: 'xxABCxx' })['code']).toEqual(['pattern'])
  })

  test('formats carry their own name as the error code', () => {
    expect(errorsFor({ email: 'not-an-email' })['email']).toEqual(['email'])
    expect(errorsFor({ email: 'a@b.ch' })['email']).toBeUndefined()

    expect(errorsFor({ site: 'not a url' })['site']).toEqual(['url'])
    expect(errorsFor({ site: 'ftp://x.ch' })['site']).toEqual(['url'])
    expect(errorsFor({ site: 'https://x.ch' })['site']).toBeUndefined()

    expect(errorsFor({ ref: 'nope' })['ref']).toEqual(['uuid'])
    expect(errorsFor({ ref: '3f2b6a4e-9d1c-4e8a-b7f0-1a2b3c4d5e6f' })['ref']).toBeUndefined()
  })

  test('model validators stack with required: an empty required bounded field says required only', () => {
    const strict: FormSchema = {
      ...schema,
      model: { fields: [{ key: 'name', type: 'text', required: true, minLength: 2 }] },
    }
    const engine = createFormEngine({ schema: strict })

    expect(engine.validate().errors['name']).toEqual(['required'])

    engine.setValue(['name'], 'a')
    expect(engine.validate().errors['name']).toEqual(['minLength'])
  })

  test('they apply inside repeater rows too', () => {
    const rows: FormSchema = {
      ...schema,
      model: {
        fields: [
          {
            key: 'items',
            type: 'repeater',
            fields: [{ key: 'sku', type: 'text', pattern: '[A-Z]+-\\d+' }],
          },
        ],
      },
    }
    const engine = createFormEngine({ schema: rows, initialValue: { items: [{ sku: 'bad' }, { sku: 'AB-12' }] } })

    const report = engine.validate()
    expect(report.errors['items[0].sku']).toEqual(['pattern'])
    expect(report.errors['items[1].sku']).toBeUndefined()
  })

  test('a wrong-typed value fails the validator rather than passing it vacuously', () => {
    expect(errorsFor({ qty: 'many' })['qty']).toEqual(['min'])
  })
})

/**
 * The format checks run against whatever a person typed, at whatever length
 * the body cap allows. A regex that backtracks catastrophically is therefore a
 * denial-of-service vector reachable by anyone who can submit a form, which is
 * the whole public plane.
 *
 * The email pattern was polynomial degree 2 until a static analysis of it said
 * so. These tests pin both halves of the fix: the behaviour did not change, and
 * the pathological input is now cheap.
 */
describe('format checks are cheap on hostile input', () => {
  const emailErrors = (value: string): string[] | undefined =>
    errorsFor({ email: value })['email']

  test('the addresses people actually have are still accepted', () => {
    for (const address of [
      'ada@example.ch',
      'first.last@example.ch',
      'a+tag@sub.example.co.uk',
      "o'brien@example.org",
      'x@y.zz',
    ]) {
      expect(emailErrors(address), address).toBeUndefined()
    }
  })

  test('the ones that are not addresses are still rejected', () => {
    for (const notAnAddress of [
      'plain',
      'no@domain',
      '@example.ch',
      'a b@example.ch',
      'a@b',
      'a@.ch',
      'a@b.',
    ]) {
      expect(emailErrors(notAnAddress), notAnAddress).toEqual(['email'])
    }
  })

  test('recheck\u2019s attack string is rejected promptly rather than hanging', () => {
    // The shape recheck produced for the old pattern, shortened: a long run of
    // dotted segments that can be split in quadratically many ways. Under the
    // old regex this grows as the square of the length; under the new one it
    // is linear, so the assertion is really about the clock.
    const attack = `a@a${'.a'.repeat(20_000)}.@..a`

    const started = Date.now()
    expect(emailErrors(attack)).toEqual(['email'])
    expect(Date.now() - started).toBeLessThan(250)
  })
})

/**
 * A chosen answer is one of the options offered.
 *
 * The claim existed before the check did, in two places a reader trusts:
 * `formancy.schema.json` documents `widget: "typeahead"` with "The answer is
 * still one of the options offered", and `types.ts` says "Still one offered
 * option value." Nothing enforced either. Measured against the built engine —
 * which is the same build the server runs, so this is the hostile-payload path
 * and not a question about the UI:
 *
 *     submit() returns: {"ok":true,"errors":{}}
 *     validate():       {"valid":true,"errors":{}}
 *     value:            {"country":"XX","colour":"plaid","extras":["nope"]}
 *
 * A `select` offering CH and DE accepted `XX`; a `radio` offering only `red`
 * accepted `plaid`; a `selectboxes` offering only `gift` accepted `["nope"]`.
 * The controls this repository ships cannot produce any of those — each reaches
 * `setValue` with an option's own value or with `null` — but a payload posted
 * straight at the server is not a control.
 */
const chooser: FormSchema = {
  specVersion: '1',
  id: 'chooser',
  title: 'Chooser',
  model: {
    fields: [
      {
        key: 'country',
        type: 'select',
        options: [
          { value: 'CH', label: 'Switzerland' },
          { value: 'DE', label: 'Germany' },
        ],
      },
      { key: 'colour', type: 'radio', options: [{ value: 'red', label: 'Red' }] },
      { key: 'extras', type: 'selectboxes', options: [{ value: 'gift', label: 'Gift wrap' }] },
      // No options at all, which the schema permits: `options` is added by an
      // `if`/`then` branch and `$defs.field` requires only `key` and `type`.
      { key: 'open', type: 'select' },
    ],
  },
}

const chosen = (initialValue: Record<string, unknown>): Record<string, string[]> =>
  createFormEngine({ schema: chooser, initialValue }).validate().errors

describe('an answer is one of the options offered', () => {
  test('refuses a value no option offers, on every type that offers options', () => {
    // One code, `option`, in the shape the other model validators use: a stable
    // machine word a message catalogue can translate.
    expect(chosen({ country: 'XX' })).toEqual({ country: ['option'] })
    expect(chosen({ colour: 'plaid' })).toEqual({ colour: ['option'] })
    expect(chosen({ extras: ['nope'] })).toEqual({ extras: ['option'] })
  })

  test('accepts every value an option does offer', () => {
    // The other half, and the half that makes the case discriminate: a check that
    // refused everything would pass the case above and break every form.
    expect(chosen({ country: 'CH' })).toEqual({})
    expect(chosen({ country: 'DE', colour: 'red', extras: ['gift'] })).toEqual({})
  })

  test('refuses a list where ONE tick is not offered', () => {
    // The failure a length check alone would miss: the array is the right shape and
    // the right size, and one member of it is not an answer.
    expect(chosen({ extras: ['gift', 'nope'] })).toEqual({ extras: ['option'] })
  })

  test('says nothing about a field that offers no options', () => {
    // `options` is optional in the schema, and a field with none has nothing to be
    // outside of. This is also the seam a future `optionsSource` needs: options that
    // live outside the document cannot be checked against the document.
    expect(chosen({ open: 'anything at all' })).toEqual({})
  })

  test('leaves emptiness to required, like every other model validator', () => {
    // An empty optional field trips nothing here, so an author never has to write
    // "unless it is empty" into a list of options.
    expect(chosen({})).toEqual({})
    expect(chosen({ country: '', extras: [] })).toEqual({})
  })

  test('refuses a scalar where a list of ticks belongs, before comparing anything', () => {
    // The hostile-payload path the list branch already guards: a `type` code rather
    // than a crash on `.includes` of a string, which would have quietly matched a
    // substring.
    expect(chosen({ extras: 'gift' })).toEqual({ extras: ['type'] })
  })

  test('compares the value and never the label', () => {
    // What somebody sees is not what the form stores. A check that matched labels
    // would accept "Switzerland" and refuse "CH", which is the answer inverted.
    expect(chosen({ country: 'Switzerland' })).toEqual({ country: ['option'] })
  })
})

describe('a chooser stores a string, or it stores nothing', () => {
  const chooser: FormSchema = {
    specVersion: '2',
    id: 'chooser',
    title: 'Chooser',
    model: {
      fields: [
        { key: 'canton', type: 'select', optionsSource: 'cantons' },
        { key: 'colour', type: 'radio', options: [{ value: 'red', label: 'Red' }] },
      ],
    },
  } as unknown as FormSchema

  const errorsOf = (initialValue: Record<string, unknown>): Record<string, string[]> =>
    createFormEngine({ schema: chooser, initialValue }).validate().errors

  test('refuses a value that is not a string, on a field whose options live elsewhere', () => {
    // The hole this closes, found by review before the beta. A field with
    // `optionsSource` carries no document options, so the membership check above has
    // nothing to compare against — by design. And the server's own check walks only
    // STRINGS, so an object or an array produced no answer to ask about and was
    // stored unexamined. Measured: `sourcedAnswers` returned `[]` for
    // `{ canton: { $gt: '' } }`, `{ canton: ['ZH'] }` and `{ canton: 42 }`.
    //
    // A select stores one option's value, which is a string. Anything else is the
    // hostile-payload path, and it is refused here — in the one function the browser
    // and the server both run — rather than in either of them.
    expect(errorsOf({ canton: { $gt: '' } })).toEqual({ canton: ['type'] })
    expect(errorsOf({ canton: ['ZH'] })).toEqual({ canton: ['type'] })
    expect(errorsOf({ canton: 42 })).toEqual({ canton: ['type'] })
    expect(errorsOf({ canton: true })).toEqual({ canton: ['type'] })
  })

  test('accepts a string, which is what a chooser collects', () => {
    // The guard on the guard: a rule that refused everything would pass the case above
    // and break every select in the world.
    expect(errorsOf({ canton: 'ZH' })).toEqual({})
    expect(errorsOf({ colour: 'red' })).toEqual({})
  })

  test('leaves emptiness to required, like every other model validator', () => {
    expect(errorsOf({})).toEqual({})
    expect(errorsOf({ canton: '' })).toEqual({})
  })

  test('a non-string on a LISTED chooser was already refused, and still is', () => {
    // Not a regression test for nothing: a listed chooser compares the value against
    // its options, and no option equals an object — so it produced `option` rather
    // than `type`. The more precise code wins now, which is the honest answer to
    // "what is wrong with it".
    expect(errorsOf({ colour: { $gt: '' } })).toEqual({ colour: ['type'] })
  })
})

describe('a step, which says which numbers count', () => {
  /*
   * `step` arrived with spec 4 for the slider, and it is a **field** property
   * rather than widget configuration precisely so this exists: a value the
   * client accepted and the server refused is the drift this project exists to
   * prevent, and presentation cannot be checked on the server at all.
   *
   * Counted from `min` when there is one, and from zero when there is not. That
   * choice is the difference between a scale of 2, 7, 12 and one of 0, 5, 10
   * when the author wrote `min: 2, step: 5` — and the first is what they meant,
   * because they also wrote the minimum.
   */
  const codesFor = (def: Record<string, unknown>, value: unknown): string[] =>
    createFormEngine({
      schema: {
        specVersion: '4',
        id: 'survey',
        title: 'Survey',
        model: { fields: [{ key: 'n', type: 'number', ...def } as never] },
      },
      initialValue: { n: value },
    }).validate().errors['n'] ?? []

  test('accepts a multiple of the step and refuses one in between', () => {
    expect(codesFor({ step: 5 }, 10)).not.toContain('step')
    expect(codesFor({ step: 5 }, 7)).toContain('step')
  })

  test('counts from the minimum, not from zero', () => {
    // `min: 2, step: 5` is a scale of 2, 7, 12 — which is what an author who
    // wrote both of those meant. Counting from zero would refuse every value on
    // their own scale and accept 0, which their minimum forbids.
    expect(codesFor({ min: 2, step: 5 }, 7)).not.toContain('step')
    expect(codesFor({ min: 2, step: 5 }, 5)).toContain('step')
  })

  test('and tolerates the arithmetic, because 0.1 three times is not 0.3', () => {
    /*
     * The real trap, and the reason this is not `value % step === 0`.
     * `0.30000000000000004 % 0.1` is `0.09999999999999998`, so a slider at 0.3
     * with a step of 0.1 — a perfectly ordinary configuration — would report an
     * invalid answer that the control itself produced, on a value the person
     * never typed.
     *
     * Measured: every tenth from 0 to 1 is accepted, which the remainder test
     * fails on three of.
     */
    for (let tenth = 0; tenth <= 10; tenth += 1) {
      const value = tenth / 10
      expect(codesFor({ min: 0, max: 1, step: 0.1 }, value), `${String(value)} was refused`).not.toContain('step')
    }
    // And it is a tolerance, not an amnesty: half a step out is still out.
    expect(codesFor({ min: 0, max: 1, step: 0.1 }, 0.05)).toContain('step')
  })

  test('and says nothing about a field with no step', () => {
    // A guard on the guard: a validator that always pushed `step` would make
    // every case above pass for the wrong reason.
    expect(codesFor({}, 7)).not.toContain('step')
    expect(codesFor({ min: 0, max: 10 }, 7)).not.toContain('step')
  })

  test('and refuses a non-number the way the bounds do, rather than comparing NaN', () => {
    // The hostile-payload path on the server: a string where a number belongs
    // must fail rather than sail through arithmetic that is vacuously true.
    expect(codesFor({ step: 5 }, 'seven')).toContain('step')
  })
})
