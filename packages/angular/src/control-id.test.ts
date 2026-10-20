import { Component, provideZonelessChangeDetection } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { fireEvent, render, screen } from '@testing-library/angular'
import { afterEach, describe, expect, test } from 'vitest'
import { createFormEngine } from '@formancy/core'
import type { FormEngine } from '@formancy/core'
import { FIELD_TYPES, WIDGETS_BY_FIELD_TYPE } from '@formancy/spec'
import type { FieldDef, FieldType, FieldWidget, FormSchema } from '@formancy/spec'
import { focusControl } from './focus-control.js'
import { FormancyErrorSummary, FormancyForm, provideFormancy, provideFormancyUploader } from './index'
import type { Uploader } from './index'

// Testing-library's auto-cleanup hooks into a global afterEach, which vitest
// only provides with globals: true; we keep globals off, so reset explicitly.
afterEach(() => {
  TestBed.resetTestingModule()
  document.body.innerHTML = ''
})

/**
 * Every field that takes an answer has an element with the engine's control id (0186), as
 * the Angular renderer draws it.
 *
 * The same cases as `packages/react/src/control-id.test.tsx`, by the same names, because the
 * two renderers must put one id in one place. A near-copy rather than a shared helper: a
 * renderer's markup is exactly the thing that must not be shared. A radio group and a set of
 * tick boxes carry the id on their fieldset and `focusControl` moves into the first option; a
 * signature carries it on its typed box. None of the three drew an element with the id, so
 * the summary's link and a failed submit left focus where it was. The last block holds the
 * rule itself over every type and widget the spec has, as React's does; Material's controls
 * are held to it in `packages/angular/material/src/controls.test.ts`.
 */
const options = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
]

const FIELDS = {
  smoker: { key: 'smoker', type: 'radio', label: 'Smoker', required: true, options },
  allergies: { key: 'allergies', type: 'selectboxes', label: 'Allergies', required: true, options },
  mark: { key: 'mark', type: 'signature', label: 'Signature', required: true },
} as const

type Key = keyof typeof FIELDS

function visit(...fields: ReadonlyArray<Key | Record<string, unknown>>): FormSchema {
  return {
    specVersion: '4',
    id: 'visit',
    title: 'Visit',
    model: { fields: fields.map((field) => (typeof field === 'string' ? FIELDS[field] : field)) },
  } as unknown as FormSchema
}

@Component({
  selector: 'formancy-test-control-id-host',
  imports: [FormancyErrorSummary, FormancyForm],
  template: `
    <formancy-error-summary />
    <formancy-form />
  `,
})
class SummaryHost {}

async function mount(schema: FormSchema, summary = false) {
  const engine = createFormEngine({ schema })
  const view = await render(summary ? SummaryHost : FormancyForm, {
    providers: [provideZonelessChangeDetection(), provideFormancy(engine)],
  })
  await view.fixture.whenStable()
  /** Press a control as a person would, and let the change land. */
  const press = async (element: HTMLElement): Promise<void> => {
    fireEvent.click(element)
    await view.fixture.whenStable()
  }
  return { engine, press }
}

/** Where the keyboard belongs in each field: its first option, or the box a name is typed into. */
const LANDING: Record<Key, () => HTMLElement> = {
  smoker: () => screen.getByRole('radio', { name: 'Yes' }),
  allergies: () => screen.getByRole('checkbox', { name: 'Yes' }),
  mark: () => screen.getByRole('textbox', { name: 'Type your name' }),
}

/** The three fields, as each case names them, and the summary's link to each. */
const CASES = [
  { kind: 'radio group', key: 'smoker', where: 'its first radio', link: 'Smoker: required' },
  { kind: 'set of tick boxes', key: 'allergies', where: 'its first box', link: 'Allergies: required' },
  { kind: 'signature', key: 'mark', where: 'the box a name is typed into', link: 'Signature: required' },
] as const

const controlId = (engine: FormEngine, key: Key): string => engine.getFieldSnapshot([key]).ids.control

describe('the element a field’s control id names', () => {
  test('a radio group’s is its group, and each radio keeps its own id', async () => {
    // No element had it, so a host focusing the field by `ids.control` reached nothing. On
    // the group and not on the first radio: the radios keep `<id>:<value>`, which a host or a
    // stylesheet may already hold, and no radio's id differs from its siblings'.
    const { engine } = await mount(visit('smoker'))
    const id = controlId(engine, 'smoker')

    expect(document.getElementById(id)).toBe(screen.getByRole('group', { name: 'Smoker' }))
    expect(screen.getByRole('radio', { name: 'Yes' }).id).toBe(`${id}:yes`)
    expect(screen.getByRole('radio', { name: 'No' }).id).toBe(`${id}:no`)
  })

  test('a set of tick boxes’ is its group, and each box keeps its own id', async () => {
    // As the radio group: nothing had the id, and the boxes' own ids are not moved to make room.
    const { engine } = await mount(visit('allergies'))
    const id = controlId(engine, 'allergies')

    expect(document.getElementById(id)).toBe(screen.getByRole('group', { name: 'Allergies' }))
    expect(screen.getByRole('checkbox', { name: 'Yes' }).id).toBe(`${id}:yes`)
    expect(screen.getByRole('checkbox', { name: 'No' }).id).toBe(`${id}:no`)
  })

  test('a signature’s is the box its name is typed into, which the field’s label points at', async () => {
    // The typed box had no id, so the field's label pointed at an id nothing had and named
    // nothing. The label's target is read off the DOM, because the box's name stays its own
    // words, from `aria-label`, and a label's target is not in the accessibility tree; and not
    // by pressing it, which jsdom does not turn into focus on the control.
    const { engine } = await mount(visit('mark'))

    expect(document.getElementById(controlId(engine, 'mark'))).toBe(LANDING.mark())
    expect((screen.getByText('Signature', { selector: 'label' }) as HTMLLabelElement).control).toBe(LANDING.mark())
  })
})

describe('the error summary’s link', () => {
  test.each(CASES)('to a required $kind left empty takes focus to $where', async ({ key, link }) => {
    // The link named the field and did nothing: its `href` was an id no element had, and its
    // handler, which prevents the browser's own jump, found nothing to focus — so focus stayed
    // on the link, the page did not scroll, and a keyboard had to hunt for the question.
    const { press } = await mount(visit(key), true)
    await press(screen.getByRole('button', { name: 'Submit' }))
    await press(screen.getByRole('link', { name: link }))

    expect(document.activeElement).toBe(LANDING[key]())
  })
})

describe('a failed submit without a summary', () => {
  test.each(CASES)('whose first invalid field is a required $kind takes focus to $where', async ({ key }) => {
    // Focus stayed on Submit, so nothing said where the problem was; a field after it, a text
    // box that is required too, shows the submit going to the first invalid one and no other.
    const { press } = await mount(visit(key, { key: 'name', type: 'text', label: 'Name', required: true }))
    await press(screen.getByRole('button', { name: 'Submit' }))

    expect(document.activeElement).toBe(LANDING[key]())
  })
})

/**
 * Each type as small as it can be and still be drawn with a control, or why it has no
 * control — React's table, so the two renderers are held over the same fields. Keyed by the
 * spec's own type, so a type added there without an entry here is a compile error; and every
 * widget the spec allows a type is drawn too, read from the spec's own map.
 */
const MINIMAL: Record<FieldType, Partial<FieldDef> | { noControl: string }> = {
  text: {},
  textarea: {},
  // Bounds, because a rating with no `max` has nothing to draw.
  number: { min: 0, max: 10 },
  checkbox: {},
  select: { options },
  radio: { options },
  selectboxes: { options },
  ranking: { options },
  matrix: { rows: options, options },
  date: {},
  time: {},
  datetime: {},
  // Drawn with the uploader every case below supplies. Without one the field draws a
  // sentence in its control's place, and no element has its id (0186).
  file: {},
  richtext: {},
  signature: {},
  repeater: { fields: [{ key: 'x', type: 'text', label: 'X' }] },
  hidden: { noControl: 'it is collected without being shown' },
  static: { noControl: 'it is text to read, and takes no answer' },
  group: { noControl: 'it holds fields, each held here as itself, and takes no answer of its own' },
  page: { noControl: 'it is a step that holds fields, and takes no answer of its own' },
}

const WIDGETS: Partial<Record<FieldType, readonly FieldWidget[]>> = WIDGETS_BY_FIELD_TYPE

/** Every type with a control, once as its default control and once as each of its widgets. */
const DRAWN = FIELD_TYPES.flatMap((type) => {
  const minimal = MINIMAL[type]
  if ('noControl' in minimal) return []
  return [undefined, ...(WIDGETS[type] ?? [])].map((widget) => ({
    name: widget === undefined ? `a ${type}` : `a ${type} drawn as ${widget}`,
    field: { key: 'f', type, label: 'F', ...minimal, ...(widget === undefined ? {} : { widget }) },
  }))
})

/** Never called: a file field draws its control only where the host can take a file. */
const upload: Uploader = () => new Promise(() => undefined)

describe('every field drawn with a control', () => {
  test.each(DRAWN)('$name has one element with its control id, and focus moved by it lands in the field', async ({ field }) => {
    // The three fields above were missed because each group that carried the id carried it
    // without a rule saying so, and nothing held the next one to it. This is that rule, over
    // the spec's own list: a type or a widget drawn with no element carrying its id, or with
    // the id on an element focus cannot be moved into, is a field the summary names and
    // cannot take anybody to. `focusControl` is what the summary's link and a failed submit
    // call with that element.
    const engine = createFormEngine({
      schema: { specVersion: '4', id: 'one', title: 'One', model: { fields: [field] } } as unknown as FormSchema,
    })
    const view = await render(FormancyForm, {
      providers: [provideZonelessChangeDetection(), provideFormancy(engine), provideFormancyUploader(upload)],
    })
    await view.fixture.whenStable()
    const id = engine.getFieldSnapshot(['f']).ids.control
    const named = Array.from(document.querySelectorAll<HTMLElement>('[id]')).filter((element) => element.id === id)
    const drawn = document.querySelector('[data-formancy-field-path="f"]')

    expect(named).toHaveLength(1)
    expect(drawn?.contains(document.activeElement)).toBe(false)
    focusControl(named[0] ?? null)
    expect(drawn?.contains(document.activeElement)).toBe(true)
  })
})
