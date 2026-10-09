import { provideZonelessChangeDetection } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { render } from '@testing-library/angular'
import { afterEach, describe, expect, test } from 'vitest'
import { createFormEngine } from '@formancy/core'
import { FIELD_TYPES } from '@formancy/spec'
import type { FieldDef, FieldType, FormSchema } from '@formancy/spec'
import { FormancyForm, provideFormancy } from './index'

afterEach(() => {
  TestBed.resetTestingModule()
  document.body.replaceChildren()
})

/**
 * Every field an arrangement places says which field it is — the React suite's case,
 * here for `@formancy/angular`, whose markup the builder's arrange surface reads the same
 * way (0050). A static text and a repeater were drawn without it in both renderers.
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
  group: { fields: [{ key: 'x', type: 'text', label: 'X' }] },
  page: { notDrawn: 'a page cannot be placed, since an arrangement reads through it' },
}

const placed = FIELD_TYPES.filter((type) => !('notDrawn' in MINIMAL[type]))

describe('every field an arrangement places', () => {
  test.each(placed)('a %s is drawn saying which field it is, once', async (type) => {
    const schema = {
      specVersion: '4',
      id: 'one',
      title: 'One',
      model: { fields: [{ key: 'f', type, label: 'F', ...MINIMAL[type] }] },
      layouts: [{ name: 'web', nodes: [{ kind: 'field', path: 'f' }] }],
    } as FormSchema
    const view = await render(FormancyForm, {
      inputs: { layout: 'web' },
      providers: [provideZonelessChangeDetection(), provideFormancy(createFormEngine({ schema }))],
    })
    await view.fixture.whenStable()

    expect(document.querySelectorAll('[data-formancy-field-path="f"]')).toHaveLength(1)
  })
})
