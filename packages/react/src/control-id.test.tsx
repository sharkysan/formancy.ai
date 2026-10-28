import { act, cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, test } from 'vitest'
import { createFormEngine } from '@formancy/core'
import type { FormEngine } from '@formancy/core'
import { FIELD_TYPES, WIDGETS_BY_FIELD_TYPE } from '@formancy/spec'
import type { FieldDef, FieldType, FieldWidget, FormSchema } from '@formancy/spec'
import { focusControl } from './focus-control.js'
import { ErrorSummary, FormancyForm, FormancyProvider, UploaderProvider } from './index.js'
import type { Uploader } from './index.js'

afterEach(cleanup)

/**
 * Every field that takes an answer has an element with the engine's control id (0186).
 *
 * The error summary's link and a failed submit move focus by that id, and a host may hold
 * it too (0021). A radio group and a set of tick boxes carry it on their fieldset, as the
 * rating, the ranking, the matrix and the repeater carry it on their group, and
 * `focusControl` moves into the first option, since a fieldset takes no focus; a signature
 * carries it on its typed box, the one part of it a keyboard can use. None of the three drew
 * an element with the id, so the link and the submit left focus where it was and the page
 * did not even scroll. The Angular renderer is held to the same cases, by the same names, in
 * `packages/angular/src/control-id.test.ts`, and Material's groups in
 * `packages/angular/material/src/controls.test.ts`. The last block holds the rule itself over
 * every type and widget the spec has, so the next group is held to it without anybody
 * remembering to write its case.
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

function visit(...keys: readonly Key[]): FormSchema {
  return {
    specVersion: '4',
    id: 'visit',
    title: 'Visit',
    model: { fields: keys.map((key) => FIELDS[key]) },
  } as unknown as FormSchema
}

function mount(schema: FormSchema, summary = false): FormEngine {
  const engine = createFormEngine({ schema })
  render(
    <FormancyProvider engine={engine}>
      {summary ? <ErrorSummary /> : null}
      <FormancyForm />
    </FormancyProvider>,
  )
  return engine
}

/** Where the keyboard belongs in each field: its first option, or the box a name is typed into. */
const LANDING: Record<Key, () => HTMLElement> = {
  smoker: () => screen.getByRole('radio', { name: 'Yes' }),
  allergies: () => screen.getByRole('checkbox', { name: 'Yes' }),
  mark: () => screen.getByRole('textbox', { name: 'Signature: type your name' }),
}

/** The three fields, as each case names them, and the summary's link to each. */
const CASES = [
  { kind: 'radio group', key: 'smoker', where: 'its first radio', link: 'Smoker: This question needs an answer.' },
  { kind: 'set of tick boxes', key: 'allergies', where: 'its first box', link: 'Allergies: This question needs an answer.' },
  { kind: 'signature', key: 'mark', where: 'the box a name is typed into', link: 'Signature: This question needs an answer.' },
] as const

const controlId = (engine: FormEngine, key: Key): string => engine.getFieldSnapshot([key]).ids.control

describe('the element a field’s control id names', () => {
  test('a radio group’s is its group, and each radio keeps its own id', () => {
    // No element had it, so a host focusing the field by `ids.control` reached nothing. On
    // the group and not on the first radio: the radios keep `<id>:<value>`, which a host or a
    // stylesheet may already hold, and no radio's id differs from its siblings'.
    const engine = mount(visit('smoker'))
    const id = controlId(engine, 'smoker')

    expect(document.getElementById(id)).toBe(screen.getByRole('group', { name: 'Smoker' }))
    expect(screen.getByRole('radio', { name: 'Yes' }).id).toBe(`${id}:yes`)
    expect(screen.getByRole('radio', { name: 'No' }).id).toBe(`${id}:no`)
  })

  test('a set of tick boxes’ is its group, and each box keeps its own id', () => {
    // As the radio group: nothing had the id, and the boxes' own ids are not moved to make room.
    const engine = mount(visit('allergies'))
    const id = controlId(engine, 'allergies')

    expect(document.getElementById(id)).toBe(screen.getByRole('group', { name: 'Allergies' }))
    expect(screen.getByRole('checkbox', { name: 'Yes' }).id).toBe(`${id}:yes`)
    expect(screen.getByRole('checkbox', { name: 'No' }).id).toBe(`${id}:no`)
  })

  test('a signature’s is the box its name is typed into, which the field’s label points at', async () => {
    // The typed box had no id, so the field's label pointed at an id nothing had and named
    // nothing. Pressing the label reaching the box is read off the focus, because the box's
    // name stays its own words, from `aria-label`, and a label's target is not in the tree.
    const engine = mount(visit('mark'))

    expect(document.getElementById(controlId(engine, 'mark'))).toBe(LANDING.mark())
    await userEvent.click(screen.getByText('Signature', { selector: 'label' }))
    expect(document.activeElement).toBe(LANDING.mark())
  })
})

describe('the error summary’s link', () => {
  test.each(CASES)('to a required $kind left empty takes focus to $where', async ({ key, link }) => {
    // The link named the field and did nothing: its `href` was an id no element had, and its
    // handler, which prevents the browser's own jump, found nothing to focus — so focus stayed
    // on the link, the page did not scroll, and a keyboard had to hunt for the question.
    mount(visit(key), true)
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }))
    await userEvent.click(screen.getByRole('link', { name: link }))

    expect(document.activeElement).toBe(LANDING[key]())
  })
})

describe('a failed submit without a summary', () => {
  test.each(CASES)('whose first invalid field is a required $kind takes focus to $where', async ({ key }) => {
    // Focus stayed on Submit, so nothing said where the problem was; a field after it, a text
    // box that is required too, shows the submit going to the first invalid one and no other.
    mount({
      ...visit(key),
      model: { fields: [FIELDS[key], { key: 'name', type: 'text', label: 'Name', required: true }] },
    } as unknown as FormSchema)
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }))

    expect(document.activeElement).toBe(LANDING[key]())
  })
})

/**
 * Each type as small as it can be and still be drawn with a control, or why it has no
 * control. Keyed by the spec's own type, so a type added there without an entry here is a
 * compile error; and every widget the spec allows a type is drawn too, read from the spec's
 * own map, so a widget added there is held here with no edit at all.
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
  test.each(DRAWN)('$name has one element with its control id, and focus moved by it lands in the field', ({ field }) => {
    // The three fields above were missed because each group that carried the id carried it
    // without a rule saying so, and nothing held the next one to it. This is that rule, over
    // the spec's own list: a type or a widget drawn with no element carrying its id, or with
    // the id on an element focus cannot be moved into, is a field the summary names and
    // cannot take anybody to. `focusControl` is what the summary's link and a failed submit
    // call with that element.
    const engine = createFormEngine({
      schema: { specVersion: '4', id: 'one', title: 'One', model: { fields: [field] } } as unknown as FormSchema,
    })
    render(
      <UploaderProvider value={upload}>
        <FormancyProvider engine={engine}>
          <FormancyForm />
        </FormancyProvider>
      </UploaderProvider>,
    )
    const id = engine.getFieldSnapshot(['f']).ids.control
    const named = Array.from(document.querySelectorAll<HTMLElement>('[id]')).filter((element) => element.id === id)
    const drawn = document.querySelector('[data-formancy-field-path="f"]')

    expect(named).toHaveLength(1)
    expect(drawn?.contains(document.activeElement)).toBe(false)
    act(() => focusControl(named[0] ?? null))
    expect(drawn?.contains(document.activeElement)).toBe(true)
  })

  test.each(DRAWN)('$name, under a rule that disables it, has nothing in it a person can operate', ({ field }) => {
    // A rule's `disabled` keeps the answer and greys the field out, and the renderer is the only
    // thing that holds it: the engine takes a value set on a disabled field. So everything the
    // field draws that takes input has to be disabled with it. A radio group's radios, React's
    // rating and a signature's box, drawing surface and Clear were not, and each took an answer
    // under the rule (B6a); nothing held the next control to it. A form control is disabled when
    // it matches `:disabled`, itself or through a disabled fieldset; an editable region when it
    // is not editable; anything else a keyboard reaches, when it says `aria-disabled`.
    // Without the rule there is something to operate, so the check cannot pass by finding
    // nothing.
    expect(operable(drawnUnder(field, 'false'))).not.toEqual([])
    cleanup()
    expect(operable(drawnUnder(field, 'true'))).toEqual([])
  })

  test.each(DRAWN)('$name, required, described and sent empty, names no id that is not drawn', async ({ field }) => {
    // The engine composes every id a control points at (0021), and the renderer draws the
    // elements that carry them. A required tag picker pointed its box at a required hint it
    // never drew — the engine had decided it was a group — so nothing said the field was
    // required (D4, 0211); nothing held the next control to drawing what it names. Required, with
    // a description and an error, so every slot the engine can name is named.
    const engine = createFormEngine({
      schema: {
        specVersion: '5',
        id: 'one',
        title: 'One',
        model: { fields: [{ ...field, required: true, description: 'Help.' }] },
      } as unknown as FormSchema,
    })
    render(
      <UploaderProvider value={upload}>
        <FormancyProvider engine={engine}>
          <FormancyForm />
        </FormancyProvider>
      </UploaderProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }))
    const drawn = document.querySelector('[data-formancy-field-path="f"]')
    expect(drawn).not.toBeNull()

    const named = idsNamedWithin(drawn!)
    // A guard on the guard: a required field with a description names at least those two.
    expect(named.length).toBeGreaterThan(0)
    expect(named.filter(({ id }) => document.getElementById(id) === null)).toEqual([])
  })
})

/** The field drawn alone, under a `disabled` rule whose condition is `cel`. */
function drawnUnder(field: Partial<FieldDef>, cel: string): Element {
  const engine = createFormEngine({
    schema: {
      specVersion: '4',
      id: 'one',
      title: 'One',
      model: { fields: [field] },
      logic: { rules: [{ target: 'f', kind: 'disabled', cel }] },
    } as unknown as FormSchema,
    capabilities: { now: () => 0, today: () => '2026-10-28', random: () => 0.5 },
  })
  render(
    <UploaderProvider value={upload}>
      <FormancyProvider engine={engine}>
        <FormancyForm />
      </FormancyProvider>
    </UploaderProvider>,
  )
  const drawn = document.querySelector('[data-formancy-field-path="f"]')
  if (drawn === null) throw new Error('the field drew nothing to look inside')
  return drawn
}

/**
 * What inside `root` a person could still change an answer through: a form control not
 * `:disabled`, a region still editable, or anything else focusable not marked
 * `aria-disabled`. Each named by its tag and its accessible role or type, so a failure says
 * which part of the field it was.
 */
function operable(root: Element): string[] {
  const live: string[] = []
  for (const element of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
    const name = `${element.tagName.toLowerCase()}${element.getAttribute('role') ? `[role=${element.getAttribute('role')}]` : ''}${element.getAttribute('type') ? `[type=${element.getAttribute('type')}]` : ''}`
    if (element.matches('input, select, textarea, button')) {
      if (element.matches('input[type=hidden]')) continue
      if (!element.matches(':disabled')) live.push(name)
    } else if (element.isContentEditable) {
      live.push(`${name}[contenteditable]`)
    } else if (element.tabIndex >= 0 && element.getAttribute('aria-disabled') !== 'true') {
      if (element.matches('a[href]')) continue
      live.push(name)
    }
  }
  return live
}

/** Every id an element inside `root`, or `root` itself, points at, with the attribute that names it. */
function idsNamedWithin(root: Element): Array<{ id: string; by: string }> {
  const ATTRIBUTES = ['aria-describedby', 'aria-labelledby', 'aria-controls', 'aria-errormessage', 'aria-activedescendant', 'aria-owns', 'for']
  const named: Array<{ id: string; by: string }> = []
  for (const element of [root, ...Array.from(root.querySelectorAll('*'))]) {
    for (const by of ATTRIBUTES) {
      for (const id of (element.getAttribute(by) ?? '').split(/\s+/)) {
        if (id !== '') named.push({ id, by: `${element.tagName.toLowerCase()}[${by}]` })
      }
    }
  }
  return named
}
