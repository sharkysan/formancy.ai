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
