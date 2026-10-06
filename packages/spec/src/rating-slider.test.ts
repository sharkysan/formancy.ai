import { describe, expect, test } from 'vitest'
import {
  CURRENT_SPEC_VERSION,
  FIELD_WIDGETS,
  SPEC_3_WIDGETS,
  SPEC_4_WIDGETS,
  SPEC_VERSIONS,
  WIDGETS_BY_FIELD_TYPE,
} from './types.js'
import type { FormSchema } from './types.js'
import { validateSchema } from './validate.js'

/**
 * Spec version 4 opens with two widgets on `number`.
 *
 * **Widgets, not types, and that is the whole design.** Every widget in this
 * format carries the same promise: it changes the control a reader sees and
 * **not** the answer that is stored. A rating is a number between two bounds and
 * a slider is a number between two bounds, so both are a `number` field wearing
 * different paint — which means a version 3 reader given one renders a number
 * input, collects the same answer, and is wrong only about how it looked.
 *
 * That is also why it is still a version. The format is closed, so a version 3
 * reader does not shrug at `widget: "rating"` — it refuses the document. And a
 * version that silently rendered the default control would be the exact failure
 * the version line exists to prevent ([0065](../../../docs/decisions/0065-a-widget-is-authored-not-registered.md)).
 *
 * `ranking` and `matrix` are **not** here for the same reason these two are: a
 * ranking stores the respondent's order and a matrix stores a row-to-column map,
 * and neither is an answer any existing type holds. They are types, they are
 * larger, and they come later in version 4
 * ([0104](../../../docs/decisions/0104-spec-4-opens-with-a-widget-not-a-type.md)).
 */
const document_ = (over: Partial<FormSchema> = {}): FormSchema => ({
  specVersion: '4',
  id: 'survey',
  title: 'How did we do',
  model: { fields: [{ key: 'score', type: 'number', min: 0, max: 10, widget: 'rating' }] },
  ...over,
})

const errorsOf = (schema: FormSchema): string[] => {
  const result = validateSchema(schema)
  return result.valid ? [] : result.errors.map((error) => error.message)
}

describe('what version 4 is', () => {
  test('a version this package speaks, and the one it writes by default', () => {
    expect([...SPEC_VERSIONS]).toEqual(['1', '2', '3', '4'])
    expect(CURRENT_SPEC_VERSION).toBe('4')
  })

  test('with a seam of its own, so the next version can tell what it added', () => {
    /*
     * `SPEC_3_WIDGETS` exists for the reason `SPEC_2_WIDGETS` did: the version a
     * construct arrived in has to be derivable, or the guard that checks
     * `MIGRATIONS.md` names it has nothing to compare against. Version 3's
     * widgets were "everything in `FIELD_WIDGETS` that is not version 2's",
     * which stopped being an answer the moment there was a fourth version.
     */
    expect([...SPEC_4_WIDGETS]).toEqual(['rating', 'slider'])
    expect(SPEC_3_WIDGETS, 'version 3 has no seam of its own').toContain('tagpicker')
    expect([...FIELD_WIDGETS]).toEqual([...SPEC_3_WIDGETS, ...SPEC_4_WIDGETS])
  })
})

describe('where the two widgets may go', () => {
  test('on a number field, which is the type whose answer they both already store', () => {
    expect(WIDGETS_BY_FIELD_TYPE.number).toEqual(['rating', 'slider'])
    expect(errorsOf(document_())).toEqual([])
  })

  test('and nowhere else, because a rating on a text field is an author who was not told', () => {
    // The same reasoning `datagrid` on a text field gets: a document that
    // validates is a document nobody warns, and the author believes they
    // configured a rating.
    const errors = errorsOf(
      document_({ model: { fields: [{ key: 'name', type: 'text', widget: 'rating' }] } }),
    )

    expect(errors.length, 'a rating on a text field validated').toBeGreaterThan(0)
  })
})

describe('what the version line does with them', () => {
  test('a version 3 document may not carry one, because a version 3 reader refuses it', () => {
    /*
     * Not "renders a number input instead". The format is closed, so a version 3
     * reader answers `widget must be one of …` and refuses the whole document —
     * which is the behaviour that makes the version line mean anything.
     */
    const errors = errorsOf(document_({ specVersion: '3' }))

    expect(errors.join(' ')).toContain('needs specVersion "4"')
  })

  test('and the error names 4 rather than 3, which a presence test would have got wrong', () => {
    /*
     * The trap the comment in `validate.ts` predicted before this version
     * existed: the gate read `spec2Widgets.has(widget) ? 2 : 3`, which answers
     * **3** for every widget there will ever be. A version 3 document carrying a
     * version 4 widget would have been told it needed version 3, which it already
     * declared — an error that contradicts itself and sends the author nowhere.
     */
    const errors = errorsOf(document_({ specVersion: '3' }))

    expect(errors.join(' '), 'the gate still answers with the previous version').not.toContain(
      'needs specVersion "3"',
    )
  })

  test('while a version 3 widget in a version 3 document is still fine', () => {
    // A guard on the guard: a gate that answered 4 for everything would make the
    // case above pass and break every document that exists.
    expect(
      errorsOf({
        specVersion: '3',
        id: 'tags',
        title: 'Tags',
        model: {
          fields: [
            {
              key: 'picks',
              type: 'selectboxes',
              widget: 'tagpicker',
              options: [{ value: 'a', label: 'A' }],
            },
          ],
        },
      }),
    ).toEqual([])
  })
})

describe('the step a slider moves in', () => {
  test('is a number field property, so a plain number input honours it too', () => {
    /*
     * `step` is not widget configuration. A slider is unusable without one — from
     * 0 to 1 in steps of 1 is a two-position switch — but the property says what
     * counts as a valid answer, which is the field's business and the server's.
     * Putting it in the widget would have made it presentation, and a value the
     * client accepted and the server did not is the drift this project exists to
     * prevent.
     */
    expect(errorsOf(document_({
      model: { fields: [{ key: 'score', type: 'number', min: 0, max: 10, step: 0.5 }] },
    }))).toEqual([])
  })

  test('and needs version 4, because a version 3 reader refuses an unknown property', () => {
    const errors = errorsOf(
      document_({
        specVersion: '3',
        model: { fields: [{ key: 'score', type: 'number', step: 1 }] },
      }),
    )

    expect(errors.join(' ')).toContain('needs specVersion "4"')
  })

  test('and may not be zero or negative, which no value could ever satisfy', () => {
    // A step of 0 makes every answer invalid and a negative one reads as a
    // direction. Refused at authoring time, where somebody can fix it, rather
    // than at answering time, where they cannot.
    for (const step of [0, -1]) {
      expect(
        errorsOf(document_({ model: { fields: [{ key: 'n', type: 'number', step }] } })).length,
        `step ${String(step)} validated`,
      ).toBeGreaterThan(0)
    }
  })

  test('and is refused on a field whose answer is not a number', () => {
    // Gated the way `min` and `max` are. A `step` on a text field is an author
    // who expected something to happen.
    expect(
      errorsOf(document_({ model: { fields: [{ key: 't', type: 'text', step: 1 }] } })).length,
    ).toBeGreaterThan(0)
  })
})
