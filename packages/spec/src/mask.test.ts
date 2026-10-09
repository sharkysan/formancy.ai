import { describe, expect, test } from 'vitest'
import { diffSchemas } from './diff.js'
import {
  answerFromText,
  editMasked,
  fitsMask,
  formatMasked,
  maskHasPositions,
  maskIsNumeric,
  maskPlaceholder,
  maskPositions,
} from './mask.js'
import type { FormSchema } from './types.js'
import { validateSchema } from './validate.js'

/**
 * An input mask, decided once for the engine and both renderers (0125).
 *
 * Each case is a keystroke or a check a person or a server meets. Where a case reads
 * as fiddly — a caret offset, a direction — it is because the control it stands for is
 * the one a person types a phone number into, and a caret that jumps is a field that
 * cannot be corrected without retyping it.
 */
const PHONE = '(999) 999-9999'

describe('what a mask is made of', () => {
  test('a digit, a letter, either, and characters the control writes', () => {
    expect(maskPositions('9a*-')).toEqual([
      { slot: 'digit' },
      { slot: 'letter' },
      { slot: 'either' },
      { literal: '-' },
    ])
  })

  test('and a backslash writes the character after it, so a mask can show a 9', () => {
    // Without the escape, a mask for a fixed prefix like "+49" would take the 9 as a
    // position and ask the person to type it.
    expect(maskPositions('\\99')).toEqual([{ literal: '9' }, { slot: 'digit' }])
  })

  test('and a backslash at the very end writes itself rather than vanishing', () => {
    expect(maskPositions('9\\')).toEqual([{ slot: 'digit' }, { literal: '\\' }])
  })

  test('a mask with nowhere to type is not a mask, which the validator needs to know', () => {
    expect(maskHasPositions('+41')).toBe(false)
    expect(maskHasPositions('\\9\\a')).toBe(false)
    expect(maskHasPositions('+41 99')).toBe(true)
  })
})

describe('whether an answer fills a mask, as the engine and the server ask it', () => {
  test('the typed characters alone, one in every position', () => {
    expect(fitsMask(PHONE, '5551234567')).toBe(true)
  })

  test('not the answer as it was shown, which carries the mask’s own characters', () => {
    // The stored answer is the number. A client that sent the formatted text would
    // otherwise store one of its spellings, and the next mask change would orphan it.
    expect(fitsMask(PHONE, '(555) 123-4567')).toBe(false)
  })

  test('and not one that leaves a position empty, or puts a letter where a digit goes', () => {
    expect(fitsMask(PHONE, '555123')).toBe(false)
    expect(fitsMask(PHONE, '555123456A')).toBe(false)
  })

  test('a letter is any script’s letter, and one outside the BMP is one position', () => {
    // Counting UTF-16 units would make 𝒜 two positions and refuse a complete answer.
    expect(fitsMask('aa', 'éß')).toBe(true)
    expect(fitsMask('a', '𝒜')).toBe(true)
  })
})

describe('what the control shows', () => {
  test('the typed characters in place, with the mask’s own between them', () => {
    expect(formatMasked(PHONE, '5551234567')).toBe('(555) 123-4567')
  })

  test('and stops at the last character typed, so a backspace there deletes a digit', () => {
    // Shown to the end of the mask, a written ")" would sit under the caret, and
    // backspace would remove it and the control would write it straight back.
    expect(formatMasked(PHONE, '555')).toBe('(555')
    expect(formatMasked(PHONE, '')).toBe('')
  })

  test('a placeholder that shows the shape, and a keypad when every position is a digit', () => {
    expect(maskPlaceholder(PHONE)).toBe('(___) ___-____')
    expect(maskIsNumeric(PHONE)).toBe(true)
    expect(maskIsNumeric('aa 99')).toBe(false)
  })
})

describe('an edit to the control, as the answer it means', () => {
  test('a digit typed into an empty field lands in the first position, after what the mask writes', () => {
    expect(editMasked(PHONE, '', '5')).toEqual({ answer: '5', caret: 2 })
  })

  test('and the next one past a written character goes after it, with the caret behind it', () => {
    expect(editMasked(PHONE, '555', '(5551', { caret: 5 })).toEqual({
      answer: '5551',
      caret: 7,
    })
  })

  test('a digit typed in the middle goes where the caret was, and the caret stays with it', () => {
    // "(555) 1|23" and a 9: the answer gains the 9 in that place, not at the end.
    expect(editMasked(PHONE, '555123', '(555) 1923', { caret: 8 })).toEqual({
      answer: '5551923',
      caret: 8,
    })
  })

  test('backspace just after a written character removes the digit before it', () => {
    // Otherwise the ")" is removed, written back, and the key does nothing at all.
    const { answer } = editMasked(PHONE, '555123', '(555 123', {
      caret: 4,
      direction: 'backward',
    })

    expect(answer).toBe('55123')
  })

  test('and delete just before one removes the digit after it', () => {
    const { answer } = editMasked(PHONE, '555123', '(555 123', {
      caret: 4,
      direction: 'forward',
    })

    expect(answer).toBe('55523')
  })

  test('a character no position takes is dropped, and the caret does not move', () => {
    expect(editMasked(PHONE, '555', '(555x', { caret: 5 })).toEqual({ answer: '555', caret: 4 })
  })

  test('a whole formatted value pasted in is read as one, so the mask’s own digits are not taken as typed', () => {
    // Read a character at a time, the 4 and 1 of "+41" would be the first two digits.
    expect(editMasked('+41 99 999 99 99', '', '+41 79 123 45 67').answer).toBe('791234567')
  })

  test('and bare digits pasted in fill the positions in order', () => {
    expect(editMasked('+41 99 999 99 99', '', '791234567').answer).toBe('791234567')
  })

  test('and what does not fit is cut at the last position', () => {
    expect(editMasked('99-99', '', '123456').answer).toBe('1234')
  })

  test('of two identical neighbours, the caret says which was typed', () => {
    // "(5|5" and another 5: without the caret the edit looks like it was at the end,
    // and the caret jumps there while the person is typing in the middle.
    expect(editMasked(PHONE, '55', '(555', { caret: 3 }).caret).toBe(3)
  })

  test('the caret is a UTF-16 offset, which is what the control takes', () => {
    // Positions are counted in code points; the DOM counts 𝒜 as two.
    expect(editMasked('a-a', '𝒜', '𝒜-b', { caret: 4 })).toEqual({ answer: '𝒜b', caret: 4 })
  })

  test('a scanned or programmatic value is read the way a paste is', () => {
    expect(answerFromText(PHONE, '(555) 123-4567')).toBe('5551234567')
  })
})

describe('the document', () => {
  const masked = (mask: string, specVersion = '4'): FormSchema =>
    ({
      specVersion,
      id: 'contact',
      title: 'Contact',
      model: { fields: [{ key: 'phone', type: 'text', mask }] },
    }) as FormSchema

  test('refuses a mask with nowhere to type, which would take no answer at all', () => {
    const result = validateSchema(masked('+41'))

    expect(result.valid ? [] : result.errors).toMatchObject([
      { path: '/model/fields/0/mask', code: 'mask.noPositions' },
    ])
  })

  test('and a mask in a document older than version 4, which no older reader knows', () => {
    const result = validateSchema(masked(PHONE, '3'))

    expect(result.valid ? [] : result.errors).toMatchObject([
      { path: '/model/fields/0/mask', code: 'version.mask', values: { version: '4' } },
    ])
  })

  test('a mask added to a field is a tightening, so stored answers are checked again', () => {
    // An answer collected without the mask may not fill it: calling the change
    // compatible would rebind a draft the form then refuses.
    const before = masked(PHONE)
    const plain = { ...before, model: { fields: [{ key: 'phone', type: 'text' as const }] } }

    expect(diffSchemas(plain, before).map((change) => change.severity)).toContain('lossy')
    expect(diffSchemas(before, plain).map((change) => change.severity)).not.toContain('lossy')
  })
})
