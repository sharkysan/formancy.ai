import { describe, expect, test } from 'vitest'
import type { FieldDef, FormSchema } from '@formancy/spec'
import { hasReadOnlyControl } from './read-only-control.js'
import { answerInWords, createFormText } from './words.js'

/**
 * A field a computed rule writes is read, never operated (0181, 0216). A text box, a paragraph,
 * a number and the three date and time boxes have a read-only state of their own; every other
 * control does not, and drew the field as one a person could change — a change the engine
 * refuses, which the Angular binding could go on showing: a ticked box over `false`. Such a
 * field is drawn as its answer in words, read-only, decided here once for both renderers.
 */
const field = (def: Partial<FieldDef>): FieldDef => ({ key: 'f', type: 'text', label: 'F', ...def }) as FieldDef

describe('a control with a read-only state of its own', () => {
  test('is a box a person types into, drawn as the field’s default control', () => {
    for (const type of ['text', 'textarea', 'number', 'date', 'time', 'datetime'] as const) {
      expect(hasReadOnlyControl(field({ type })), type).toBe(true)
    }
  })

  // A scanner's button, a rating's stars and a slider's thumb each take an answer beside or
  // instead of the box, and a select, a tick box or a list has no read-only state at all.
  test('is not one a widget draws, nor a choice, a tick, a list, a file, rich text or a signature', () => {
    expect(hasReadOnlyControl(field({ type: 'text', widget: 'scanner' }))).toBe(false)
    expect(hasReadOnlyControl(field({ type: 'number', widget: 'rating' }))).toBe(false)
    expect(hasReadOnlyControl(field({ type: 'number', widget: 'slider' }))).toBe(false)
    for (const type of ['checkbox', 'select', 'radio', 'selectboxes', 'ranking', 'matrix', 'file', 'richtext', 'signature'] as const) {
      expect(hasReadOnlyControl(field({ type })), type).toBe(false)
    }
  })
})

describe('an answer in words', () => {
  const schema: FormSchema = { specVersion: '5', id: 'x', title: 'X', model: { fields: [] } }
  const text = createFormText({ locale: 'en' })
  const options = [
    { value: 'lo', label: 'Low' },
    { value: 'hi', label: 'High' },
  ]

  // As a submission read back says it (0193): a tick as yes or no, a choice by its label, a list
  // as the language joins one, a matrix row by row.
  test('is what a submission read back says of it', () => {
    expect(answerInWords(schema, field({ type: 'checkbox' }), true, text)).toBe('Yes')
    expect(answerInWords(schema, field({ type: 'checkbox' }), false, text)).toBe('No')
    expect(answerInWords(schema, field({ type: 'select', options }), 'hi', text)).toBe('High')
    expect(answerInWords(schema, field({ type: 'selectboxes', options }), ['lo', 'hi'], text)).toBe('Low and High')
    expect(answerInWords(schema, field({ type: 'number', widget: 'rating' }), 4, text)).toBe('4')
    expect(
      answerInWords(schema, field({ type: 'matrix', options, rows: [{ value: 'a', label: 'Food' }, { value: 'b', label: 'Room' }] }), { a: 'hi', b: 'lo' }, text),
    ).toBe('Food: High and Room: Low')
  })

  test('is nothing for no answer', () => {
    expect(answerInWords(schema, field({ type: 'select', options }), null, text)).toBe('')
    expect(answerInWords(schema, field({ type: 'selectboxes', options }), [], text)).toBe('')
    expect(answerInWords(schema, field({ type: 'matrix', options, rows: [{ value: 'a', label: 'Food' }] }), {}, text)).toBe('')
  })
})
