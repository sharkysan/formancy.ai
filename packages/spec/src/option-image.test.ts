import { describe, expect, test } from 'vitest'
import { diffSchemas } from './diff.js'
import type { FieldDef, FormSchema } from './types.js'
import { validateSchema } from './validate.js'

/**
 * An option with a picture (0126).
 *
 * The picture is presentation — the answer is still the option's value — so what can
 * go wrong is all about where it is shown and where it comes from: a picture on a
 * control that cannot show one validates and shows nothing, and a picture fetched over
 * plain http is blocked on the secure page that shows the form.
 */
const formWith = (field: Partial<FieldDef>, specVersion = '4'): FormSchema =>
  ({
    specVersion,
    id: 'pets',
    title: 'Pets',
    model: { fields: [{ key: 'pet', label: 'Pet', ...field }] },
  }) as FormSchema

const radio = (src: string, type: FieldDef['type'] = 'radio', extra: Partial<FieldDef> = {}) =>
  formWith({
    type,
    options: [{ value: 'cat', label: 'Cat', image: { src, alt: 'A tabby cat asleep' } }],
    ...extra,
  })

const errorsOf = (schema: FormSchema) => {
  const result = validateSchema(schema)
  return result.valid ? [] : result.errors
}

describe('where a picture may come from', () => {
  test('an https address, a path on the same site, or the picture itself', () => {
    expect(errorsOf(radio('https://example.org/cat.png'))).toEqual([])
    expect(errorsOf(radio('/images/cat.png'))).toEqual([])
    expect(
      errorsOf(radio('data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E')),
    ).toEqual([])
  })

  test('not plain http, which the secure page showing the form would block', () => {
    expect(errorsOf(radio('http://example.org/cat.png'))).toMatchObject([
      { path: '/model/fields/0/options/0/image/src', code: 'shape.imageSource' },
    ])
  })

  test('and not a script, nor an address that only looks like a path', () => {
    // `//host/cat.png` is another site, borrowing the page's scheme; a path from the
    // site's root has one slash.
    for (const src of ['javascript:alert(1)', '//evil.example/cat.png', 'cat.png']) {
      expect(errorsOf(radio(src)), src).toMatchObject([{ code: 'shape.imageSource' }])
    }
  })
})

describe('where a picture can be shown', () => {
  test('on radio buttons and on checkboxes', () => {
    expect(errorsOf(radio('/cat.png', 'radio'))).toEqual([])
    expect(errorsOf(radio('/cat.png', 'selectboxes'))).toEqual([])
  })

  test('not in a dropdown, which would validate and show nothing', () => {
    expect(errorsOf(radio('/cat.png', 'select'))).toMatchObject([
      { path: '/model/fields/0/options/0/image', code: 'option.imageInDropdown' },
    ])
  })

  test('nor as a chip in a tag picker', () => {
    expect(errorsOf(radio('/cat.png', 'selectboxes', { widget: 'tagpicker' }))).toMatchObject([
      { path: '/model/fields/0/options/0/image', code: 'option.imageInChips' },
    ])
  })

  test('and only from version 4, which a version 3 reader refuses rather than ignores', () => {
    const old = { ...radio('/cat.png'), specVersion: '3' } as FormSchema

    expect(errorsOf(old)).toMatchObject([
      { path: '/model/fields/0/options/0/image', code: 'version.optionImage' },
    ])
  })
})

describe('a picture changed between versions', () => {
  test('is reported, and is compatible, because the stored value did not move', () => {
    // Options are excluded from the residual backstop, so a picture nobody compared
    // would diff as no change at all.
    const before = radio('/cat.png')
    const after = radio('/cat-awake.png')

    expect(diffSchemas(before, after)).toMatchObject([
      { kind: 'field.optionPictureChanged', severity: 'compatible' },
    ])
  })
})
