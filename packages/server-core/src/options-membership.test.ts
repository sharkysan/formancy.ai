import { describe, expect, test } from 'vitest'
import type { FormSchema } from '@formancy/spec'
import { checkMembership, sourceNamesIn, sourcedAnswers } from './options-membership.js'

/**
 * Checking a sourced answer against the deployment's own list.
 *
 * The engine refuses a value no DOCUMENT option offers, on both sides. A field
 * that names a source has no document options to compare against — deliberately,
 * because a list living outside the document cannot be checked against it — so
 * the server asks the deployment instead.
 *
 * Client validation is UX; server validation is truth, and this is the half of
 * the truth the document cannot carry.
 */
const schema = {
  specVersion: '2',
  id: 'order',
  title: 'Order',
  model: {
    fields: [
      { key: 'canton', type: 'select', label: 'Canton', optionsSource: 'cantons' },
      { key: 'note', type: 'text', label: 'Note' },
      {
        key: 'billing',
        type: 'group',
        label: 'Billing',
        fields: [{ key: 'country', type: 'select', label: 'Country', optionsSource: 'countries' }],
      },
      {
        key: 'people',
        type: 'repeater',
        label: 'People',
        fields: [{ key: 'canton', type: 'select', label: 'Canton', optionsSource: 'cantons' }],
      },
    ],
  },
} as unknown as FormSchema

describe('sourcedAnswers', () => {
  test('finds every sourced answer, including inside groups and rows', () => {
    expect(
      sourcedAnswers(schema, {
        canton: 'ZH',
        note: 'not sourced',
        billing: { country: 'CH' },
        people: [{ canton: 'BE' }, { canton: 'VD' }],
      }),
    ).toEqual([
      { path: 'canton', source: 'cantons', value: 'ZH' },
      { path: 'billing.country', source: 'countries', value: 'CH' },
      { path: 'people[0].canton', source: 'cantons', value: 'BE' },
      { path: 'people[1].canton', source: 'cantons', value: 'VD' },
    ])
  })

  test('walks the SCHEMA over the value, not the value on its own', () => {
    // A walk driven by what arrived would let a client dodge the check by sending a
    // shape nobody expects. Anything the schema does not describe is not an answer.
    expect(
      sourcedAnswers(schema, { canton: 'ZH', invented: 'XX', people: 'not a list' }),
    ).toEqual([{ path: 'canton', source: 'cantons', value: 'ZH' }])
  })

  test('says nothing about an empty answer, which is required’s business', () => {
    expect(sourcedAnswers(schema, { canton: '', billing: {} })).toEqual([])
  })
})

describe('checkMembership', () => {
  const value = { canton: 'ZH', people: [{ canton: 'XX' }] }

  test('passes when the source offers everything submitted', async () => {
    const asked: Array<readonly string[]> = []
    const outcome = await checkMembership(schema, { canton: 'ZH' }, {
      cantons: {
        members: (values) => {
          asked.push(values)
          return Promise.resolve([])
        },
      },
    })

    expect(outcome).toEqual({ ok: true })
    expect(asked).toEqual([['ZH']])
  })

  test('asks once per SOURCE, so a deployment sees one query and not one per row', async () => {
    // A source with two million rows is exactly the case `optionsSource` exists for,
    // and a query per answer would make a ten-row repeater ten round trips.
    const asked: Array<readonly string[]> = []
    await checkMembership(
      schema,
      { canton: 'ZH', people: [{ canton: 'BE' }, { canton: 'VD' }] },
      { cantons: { members: (values) => { asked.push(values); return Promise.resolve([]) } } },
    )

    expect(asked).toEqual([['ZH', 'BE', 'VD']])
  })

  test('refuses a value the source does not offer, naming the field that carried it', async () => {
    // The same code word a document option produces, so a message catalogue learns
    // one word rather than two for one idea.
    const outcome = await checkMembership(schema, value, {
      cantons: { members: (values) => Promise.resolve(values.filter((v) => v === 'XX')) },
    })

    expect(outcome).toEqual({
      ok: false,
      kind: 'invalid',
      errors: { 'people[0].canton': ['option'] },
    })
  })

  test('a source that cannot check says so, and is not treated as approval', async () => {
    // `members` absent means: this source exists, I cannot check membership. A
    // legitimate configuration, and the reason the guarantee is written down rather
    // than implied.
    expect(await checkMembership(schema, value, { cantons: {} })).toEqual({ ok: true })
  })

  test('a source that throws fails the submission CLOSED', async () => {
    // An accepted bogus value is undetectable afterwards; a refusal is retryable and
    // the draft still holds the answers. The same rule the engine applies to a
    // validation rule it cannot evaluate.
    expect(
      await checkMembership(schema, { canton: 'ZH' }, {
        cantons: { members: () => Promise.reject(new Error('down')) },
      }),
    ).toEqual({ ok: false, kind: 'source_unavailable', source: 'cantons' })
  })

  test('a source the deployment does not have is unavailable, not absent', async () => {
    // The document says these answers come from somewhere. Accepting them unchecked
    // would be the silent version of the same failure.
    expect(await checkMembership(schema, { canton: 'ZH' }, { countries: {} })).toEqual({
      ok: false,
      kind: 'source_unavailable',
      source: 'cantons',
    })
  })

  test('a deployment with no sources configured at all cannot judge, and says nothing', async () => {
    // No vocabulary means no verdict. That is a weaker guarantee and it is the
    // deployment's own choice, recorded rather than silently assumed.
    expect(await checkMembership(schema, { canton: 'ZH' }, undefined)).toEqual({ ok: true })
  })

  test('a form with no sourced field never asks anything', async () => {
    const plain = { ...schema, model: { fields: [{ key: 'note', type: 'text' }] } } as FormSchema
    let asked = false
    expect(
      await checkMembership(plain, { note: 'x' }, {
        cantons: { members: () => { asked = true; return Promise.resolve([]) } },
      }),
    ).toEqual({ ok: true })
    expect(asked).toBe(false)
  })
})

describe('sourceNamesIn', () => {
  test('lists every name a document uses, once each', () => {
    expect([...sourceNamesIn(schema)].sort()).toEqual(['cantons', 'countries'])
  })

  test('a document naming none lists none', () => {
    expect(
      sourceNamesIn({ ...schema, model: { fields: [{ key: 'note', type: 'text' }] } } as FormSchema),
    ).toEqual([])
  })
})

describe('a list answer from a source', () => {
  /*
   * `selectboxes` with an `optionsSource` is the tag picker's reason to exist: a
   * long list, or one that lives in the deployment. It also walked straight past
   * the server's membership check, because `sourcedAnswers` asked
   * `typeof held !== 'string'` and an array is not a string — so every value in
   * a sourced list was stored unexamined.
   *
   * That is hazard A7 with a different shape of answer, and it is the reason the
   * widening and this walk had to land together rather than one release apart.
   */
  const schema = {
    specVersion: '3',
    id: 'tags',
    title: 'Tags',
    model: {
      fields: [
        { key: 'topics', type: 'selectboxes', label: 'Topics', optionsSource: 'topics' },
      ],
    },
  } as unknown as FormSchema

  test('every value in the list is asked about, not just the first', () => {
    const found = sourcedAnswers(schema, { topics: ['a11y', 'forms', 'i18n'] })

    expect(found.map((answer) => answer.value)).toEqual(['a11y', 'forms', 'i18n'])
    // One path for the field rather than one per index: the FIELD is wrong when
    // any of its answers is, and naming an index would describe a payload rather
    // than the question.
    expect(new Set(found.map((answer) => answer.path))).toEqual(new Set(['topics']))
  })

  test('an empty list asks nothing, because emptiness is `required`\u2019s business', () => {
    expect(sourcedAnswers(schema, { topics: [] })).toEqual([])
  })

  test('a non-string inside the list is not passed to the deployment', () => {
    // `modelViolations` refuses the shape, and this is the belt: a source asked
    // about `{"$gt": ""}` is a source handed a query it did not expect.
    const found = sourcedAnswers(schema, { topics: ['a11y', { $gt: '' }, 7] })

    expect(found.map((answer) => answer.value)).toEqual(['a11y'])
  })
})
