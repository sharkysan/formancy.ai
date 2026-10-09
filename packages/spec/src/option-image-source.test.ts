import { describe, expect, test } from 'vitest'
import schema from '../formancy.schema.json' with { type: 'json' }
import { IMAGE_SOURCE, isImageSource } from './option-image.js'

describe('where a renderer may load an option’s picture from', () => {
  test('is the pattern the schema states, so a renderer and the validator cannot disagree', () => {
    // Two spellings of one rule are two answers waiting to differ: a picture the
    // validator accepts and a renderer refuses is a broken image nobody was told about.
    expect(IMAGE_SOURCE.source).toBe(
      new RegExp(
        (schema as { $defs: { imageSource: { pattern: string } } }).$defs.imageSource.pattern,
        'u',
      ).source,
    )
  })

  test('and answers the cases the validator does', () => {
    expect(isImageSource('https://example.org/cat.png')).toBe(true)
    expect(isImageSource('/images/cat.png')).toBe(true)
    expect(isImageSource('data:image/svg+xml,<svg/>')).toBe(true)
    expect(isImageSource('http://example.org/cat.png')).toBe(false)
    expect(isImageSource('javascript:alert(1)')).toBe(false)
  })
})
