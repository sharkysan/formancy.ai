import { describe, expect, test } from 'vitest'
import { FIELD_WIDGETS, SPEC_2_WIDGETS, WIDGETS_BY_FIELD_TYPE } from './types.js'
import type { FormSchema } from './types.js'
import { validateSchema } from './validate.js'

/**
 * `widget: "tagpicker"` — several answers, narrowed by typing.
 *
 * The other half of the combobox row on the roadmap. One answer from a list the
 * document carries is `widget: "typeahead"` on a `select`, built in both
 * renderers; this is the many-answer one, and it is a **widget on
 * `selectboxes`** rather than a field type because the answer does not change:
 * still an array of offered option values, in the options' own order.
 *
 * That is the line the widget mechanism exists to hold — a widget changes how a
 * field looks and never what it stores — and it is why this costs a property
 * rather than a type.
 *
 * It still needs version 3, and that is the trap this file was written around: a
 * *new widget value* is invisible to a gate that only asks whether `widget` is
 * present, so a version 2 reader would have refused a `signature` and waved a
 * `tagpicker` straight through.
 */
const form = (specVersion: string, field: Record<string, unknown>): FormSchema =>
  ({
    specVersion,
    id: 'tags',
    title: 'Tags',
    model: {
      fields: [
        {
          key: 'topics',
          type: 'selectboxes',
          label: 'Topics',
          options: [
            { value: 'a11y', label: 'Accessibility' },
            { value: 'forms', label: 'Forms' },
          ],
          ...field,
        },
      ],
    },
  }) as unknown as FormSchema

const problems = (document: FormSchema): string[] => {
  const report = validateSchema(document)
  return report.valid ? [] : report.errors.map((error) => error.message)
}

describe('the tag picker', () => {
  test('is a widget on selectboxes, not a field type', () => {
    expect(FIELD_WIDGETS).toContain('tagpicker')
    expect(WIDGETS_BY_FIELD_TYPE.selectboxes).toContain('tagpicker')
  })

  test('is accepted on a selectboxes field in a version 3 document', () => {
    expect(problems(form('3', { widget: 'tagpicker' }))).toEqual([])
  })

  test('is refused in a version 2 document, by name and with the version it needs', () => {
    /*
     * The half a present-or-absent gate cannot see. `widget` itself arrived in
     * version 2, so "does this field have a widget" answers yes and says nothing
     * about WHICH — and a version 2 reader given a `tagpicker` would render the
     * default control, collect the same answers and look entirely correct, which
     * is the silent failure the version line exists to prevent.
     */
    const messages = problems(form('2', { widget: 'tagpicker' }))

    expect(messages.length).toBeGreaterThan(0)
    expect(messages[0]).toMatch(/tagpicker/)
    expect(messages[0]).toMatch(/"3"/)
  })

  test('and a version 2 widget is still fine in a version 2 document', () => {
    // The guard on the guard: a gate that refused every widget in a version 2
    // document would pass the case above and break every form that has one.
    expect([...SPEC_2_WIDGETS]).toContain('typeahead')
    expect(
      problems({
        specVersion: '2',
        id: 'one',
        title: 'One',
        model: {
          fields: [
            {
              key: 'country',
              type: 'select',
              widget: 'typeahead',
              options: [{ value: 'CH', label: 'Switzerland' }],
            },
          ],
        },
      } as unknown as FormSchema),
    ).toEqual([])
  })

  test('is refused on a field type that cannot hold several answers', () => {
    // A `select` with a tag picker is an author who believes they configured
    // several answers on a field that stores one string.
    const messages = problems({
      specVersion: '3',
      id: 'one',
      title: 'One',
      model: {
        fields: [
          {
            key: 'country',
            type: 'select',
            widget: 'tagpicker',
            options: [{ value: 'CH', label: 'Switzerland' }],
          },
        ],
      },
    } as unknown as FormSchema)

    expect(messages.length).toBeGreaterThan(0)
  })

  test('works with a source, which is the case it exists for', () => {
    // A list short enough to write down does not need narrowing. The tag picker
    // earns its place when the list is long or lives in the deployment.
    expect(
      problems({
        specVersion: '3',
        id: 'tags',
        title: 'Tags',
        model: {
          fields: [
            { key: 'topics', type: 'selectboxes', widget: 'tagpicker', optionsSource: 'topics' },
          ],
        },
      } as unknown as FormSchema),
    ).toEqual([])
  })
})
