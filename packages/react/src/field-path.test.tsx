import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { createFormEngine } from '@formancy/core'
import { FIELD_TYPES } from '@formancy/spec'
import type { FieldDef, FieldType, FormSchema } from '@formancy/spec'
import { FormancyForm } from './form.js'
import { FormancyProvider } from './context.js'

afterEach(cleanup)

/**
 * Every field an arrangement places says which field it is.
 *
 * `data-formancy-field-path` is inert here and read from outside: the builder's arrange
 * surface finds the field under a pointer by it
 * ([0050](../../../docs/decisions/0050-arrange-in-two-places.md)). A field drawn without
 * it cannot be picked up on the preview, and two were: a static text, drawn as a bare
 * paragraph, and a repeater, whose fieldset named nothing while its rows' fields named
 * themselves. Derived from the spec's list of types, so the next one is not missed.
 */
const OPTIONS = [
  { value: 'a', label: 'A' },
  { value: 'b', label: 'B' },
]

/**
 * Each type as small as it can be and still be drawn — or why it is not drawn where an
 * arrangement places it. Keyed by the spec's own type, so a type added there without an
 * entry here is a compile error.
 */
const MINIMAL: Record<FieldType, Partial<FieldDef> | { notDrawn: string }> = {
  text: {},
  textarea: {},
  number: {},
  checkbox: {},
  select: { options: OPTIONS },
  radio: { options: OPTIONS },
  selectboxes: { options: OPTIONS },
  ranking: { options: OPTIONS },
  matrix: { rows: OPTIONS, options: OPTIONS },
  date: {},
  time: {},
  datetime: {},
  file: {},
  richtext: {},
  signature: {},
  static: {},
  repeater: { fields: [{ key: 'x', type: 'text', label: 'X' }] },
  hidden: { notDrawn: 'it is collected without being shown, so there is nothing to pick up' },
  group: {
    notDrawn:
      'what a placed group should draw is not decided: the validator accepts one, and both renderers throw on it',
  },
  page: { notDrawn: 'a page cannot be placed, since an arrangement reads through it' },
}

const placed = FIELD_TYPES.filter((type) => !('notDrawn' in MINIMAL[type]))

describe('every field an arrangement places', () => {
  test.each(placed)('a %s is drawn saying which field it is, once', (type) => {
    const schema = {
      specVersion: '4',
      id: 'one',
      title: 'One',
      model: { fields: [{ key: 'f', type, label: 'F', ...MINIMAL[type] }] },
      layouts: [{ name: 'web', nodes: [{ kind: 'field', path: 'f' }] }],
    } as FormSchema
    render(
      <FormancyProvider engine={createFormEngine({ schema })}>
        <FormancyForm layout="web" onSubmit={() => undefined} />
      </FormancyProvider>,
    )

    expect(document.querySelectorAll('[data-formancy-field-path="f"]')).toHaveLength(1)
  })
})
