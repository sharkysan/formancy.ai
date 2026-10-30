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
})
