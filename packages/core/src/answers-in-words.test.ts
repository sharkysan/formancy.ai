import { describe, expect, test } from 'vitest'
import type { FormSchema } from '@formancy/spec'
import { answersInWords } from './answers-in-words.js'
import { createFormText } from './words.js'

/**
 * What a submission says, question by question, for a person reading it (0193).
 *
 * The admin showed a stored submission as its JSON — `{"country":"CH","topics":["a"]}` — which
 * is what the server keeps and not what anybody answered: the person chose "Switzerland", not
 * `CH`. This reads each answer back through its own question.
 */
const form: FormSchema = {
  specVersion: '4',
  id: 'order',
  title: 'Order',
  i18n: { defaultLocale: 'en', messages: { en: { 'q.country': 'Country' }, de: { 'q.country': 'Land' } } },
  model: {
    fields: [
      { key: 'name', type: 'text', label: 'Name' },
      {
        key: 'country',
        type: 'select',
        label: { $t: 'q.country' },
        options: [
          { value: 'CH', label: 'Switzerland' },
          { value: 'DE', label: 'Germany' },
        ],
      },
      {
        key: 'topics',
        type: 'selectboxes',
        label: 'Topics',
        options: [
          { value: 'a', label: 'Apples' },
          { value: 'b', label: 'Bread' },
        ],
      },
      { key: 'qty', type: 'number', label: 'Quantity' },
      { key: 'agree', type: 'checkbox', label: 'I agree' },
      { key: 'arrive', type: 'date', label: 'Arriving' },
      { key: 'note', type: 'static', label: 'Thank you' },
      { key: 'rating', type: 'matrix', label: 'Rating', rows: [{ value: 'taste', label: 'Taste' }], options: [{ value: 'good', label: 'Good' }] },
      { key: 'proof', type: 'file', label: 'Receipt' },
      { key: 'sign', type: 'signature', label: 'Signature', box: [100, 50] },
      { key: 'address', type: 'group', label: 'Address', fields: [{ key: 'city', type: 'text', label: 'City' }] },
      { key: 'items', type: 'repeater', label: 'Items', fields: [{ key: 'sku', type: 'text', label: 'SKU' }] },
      { key: 'one', type: 'page', label: 'Page one', fields: [{ key: 'email', type: 'text', label: 'Email' }] },
    ],
  },
}

const data = {
  name: 'Ada',
  country: 'CH',
  topics: ['a', 'b'],
  qty: 1500,
  agree: true,
  arrive: '2027-05-03',
  rating: { taste: 'good' },
  proof: [{ id: 'f', name: 'receipt.pdf', size: 3, contentType: 'application/pdf', storageKey: 'k' }],
  sign: { typed: 'Ada Lovelace' },
  address: { city: 'Basel' },
  items: [
    { _id: 'r1', sku: 'A-1' },
    { _id: 'r2', sku: 'B-2' },
  ],
  email: 'ada@example.com',
}

describe('a submission in words', () => {
  test('is each answer under its question, in document order', () => {
    expect(answersInWords(form, data, createFormText({ locale: 'en' })).map(({ label, said }) => [label, said])).toEqual([
      ['Name', 'Ada'],
      ['Country', 'Switzerland'],
      ['Topics', 'Apples and Bread'],
      ['Quantity', '1,500'],
      ['I agree', 'Yes'],
      ['Arriving', '3 May 2027'],
      ['Rating › Taste', 'Good'],
      ['Receipt', 'receipt.pdf'],
      ['Signature', 'Ada Lovelace'],
      ['Address › City', 'Basel'],
      ['Items 1 › SKU', 'A-1'],
      ['Items 2 › SKU', 'B-2'],
      ['Email', 'ada@example.com'],
    ])
  })

  // The questions in the form's language, and the words around them too.
  test('in the language it is read in', () => {
    const said = answersInWords(form, data, createFormText({ locale: 'de' }), 'de')
    expect(said.find(({ path }) => path === 'country')?.label).toBe('Land')
    expect(said.find(({ path }) => path === 'agree')?.said).toBe('Ja')
    expect(said.find(({ path }) => path === 'qty')?.said).toBe('1.500')
  })

  // A question left unanswered is not a line saying nothing; one that collects nothing never
  // has a line.
  test('leaves out what was not answered, and what asks nothing', () => {
    const said = answersInWords(form, { name: '', topics: [], qty: null }, createFormText({ locale: 'en' }))
    expect(said).toEqual([])
  })

  // An answer the document cannot name — an option since removed, a value no control wrote —
  // is said as stored rather than dropped: a reviewer must see what was submitted.
  test('says an answer as stored when its question cannot name it', () => {
    const said = answersInWords(form, { country: 'FR', sign: { drawn: [[[1, 1]]] } }, createFormText({ locale: 'en' }))
    expect(said.map(({ said: words }) => words)).toEqual(['FR', 'A drawn signature'])
  })

  // The same, for an answer of a shape its question never takes: a quantity, a tick, a date and a
  // choice each holding a record were said as "[object Object]", which names nothing.
  test('says an answer of another shape as the data it is, not as "[object Object]"', () => {
    const said = answersInWords(
      form,
      { qty: { amount: 1 }, agree: { yes: true }, arrive: { on: 'friday' }, country: { code: 'CH' } },
      createFormText({ locale: 'en' }),
    )
    expect(said.map(({ said: words }) => words)).toEqual(['{"code":"CH"}', '{"amount":1}', '{"yes":true}', '{"on":"friday"}'])
  })

  // A file list whose item is not a file record: the item was written out as "[object Object]".
  test('says an uploaded item that is not a file record as the data it is', () => {
    const said = answersInWords(form, { proof: [{ id: 'x' }, 'plain'] }, createFormText({ locale: 'en' }))
    expect(said.map(({ said: words }) => words)).toEqual(['{"id":"x"} and plain'])
  })

  // What JSON cannot write, which a host's answers can hold though a stored submission cannot: a
  // bigint, alone or in a record, made JSON throw, so the whole submission failed to read back,
  // and NaN came out as "null", which reads as nothing answered. A value that is not a record is
  // said as `String` says it, as each was before a record was said as JSON.
  test('says what JSON cannot write as String writes it', () => {
    const said = answersInWords(form, { country: Number.NaN, qty: { amount: 1n }, agree: 12n }, createFormText({ locale: 'en' }))
    expect(said.map(({ said: words }) => words)).toEqual(['NaN', '{"amount":"1"}', '12'])
  })
})

/**
 * A time and an instant said at their field's precision (0237).
 *
 * A field with a precision keeps seconds and the digits after them, and a reviewer reading it
 * back to the minute, or through a `Date`, which keeps milliseconds, reads a moment the
 * submission does not hold.
 */
describe('a temporal answer in words, at its field’s precision', () => {
  const run = (type: 'time' | 'datetime', precision?: number): FormSchema => ({
    specVersion: '6',
    id: 'run',
    title: 'Run',
    model: { fields: [{ key: 'at', type, label: 'Started', ...(precision === undefined ? {} : { precision }) }] },
  })
  const said = (schema: FormSchema, at: string, locale = 'en'): string | undefined =>
    answersInWords(schema, { at }, createFormText({ locale }), locale)[0]?.said

  // A field without a precision is 0.13.0's in every respect, and its words said minutes.
  test('an instant on a field without a precision is said to the minute, in UTC, as before', () => {
    expect(said(run('datetime'), '2026-10-08T10:34:56Z')).toBe('8 October 2026 at 10:34 UTC')
  })

  // A test run timed to the second, read back to the minute, loses what it was declared to keep.
  test('an instant at precision 0 is said to the second', () => {
    expect(said(run('datetime', 0), '2026-10-08T10:34:56Z')).toBe('8 October 2026 at 10:34:56 UTC')
  })

  // Through `Date`, .789012 would be said as .789: a reading the device never gave.
  test('an instant with a fraction is said with every digit it holds, as the language writes a fraction', () => {
    expect(said(run('datetime', 6), '2026-10-08T10:34:56.789012Z')).toBe('8 October 2026 at 10:34:56.789012 UTC')
    expect(said(run('datetime', 6), '2026-10-08T10:34:56.789012Z', 'de')).toBe('8. Oktober 2026 um 10:34:56,789012 UTC')
  })

  // A wall clock reads the same everywhere, so a time is said as stored, every digit with it.
  test('a time with a precision is said as stored', () => {
    expect(said(run('time', 7), '08:03:27.1234567')).toBe('08:03:27.1234567')
  })
})
