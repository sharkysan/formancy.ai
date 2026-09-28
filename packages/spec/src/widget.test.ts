import { describe, expect, test } from 'vitest'

import { FIELD_WIDGETS, WIDGETS_BY_FIELD_TYPE } from './types.js'
import { validateSchema } from './validate.js'

/**
 * `widget` — the author says how a field should look, and nothing else.
 *
 * A developer could already do this. `registry.byType` and `registry.byPath`
 * swap the component for any field, per deployment, at zero cost to the format
 * — so "show this as a switch" was solved for anybody who writes code.
 *
 * It was not solved for the person the builder exists for. A non-technical
 * author choosing a switch over a tick-box cannot register a component, and a
 * choice only a developer can make is not an authoring feature. That is the whole
 * argument for spending format surface on it, and it is the reason the value is
 * *intent* rather than a component: the document says what the author meant, and
 * every renderer decides how to honour it.
 *
 * **A widget may change how a field looks. It may not change what it collects.**
 * The moment a hint alters the stored value, the validation, or what a person is
 * allowed to enter, it is a field type and belongs in `FIELD_TYPES` with all the
 * cost that carries. So every widget here sits on a type whose value shape it
 * leaves exactly alone: `toggle` on a `checkbox` still stores `true | false |
 * null`, `datagrid` on a `repeater` still stores rows carrying `_id`, `typeahead`
 * on a `select` still stores one offered option value.
 *
 * An open string would cost nothing to extend and would be worth nothing: two
 * renderers would guess differently at `widget: "togle"`, one would silently fall
 * back and the other would not, and a form would look right in the build that
 * knew the name and wrong everywhere else, with nothing failing anywhere. Closed
 * means a typo is an authoring-time error. It also means each new name is a
 * format change, which is the price of the guarantee.
 *
 * The obvious claim is that a hint is safely ignorable, so an older reader can
 * drop it and render the default control. **Measured, and false.**
 * `formancy.schema.json` is closed at every level — `additionalProperties: false`
 * at the root, `unevaluatedProperties: false` on a field — so a reader that has
 * never heard of `widget` does not ignore it. It answers `Unknown property
 * "widget"` and refuses the whole document: no field renders and nothing is
 * collected.
 *
 * That is [0051](../../../docs/decisions/0051-spec-2-adds-types.md)'s loud
 * failure rather than its silent one, which is the better of the two — but it
 * still means a document carrying a widget is not a document of the older
 * version. Hence the version gate below, and hence this landing in version 2
 * while version 2 is still unreleased, where it costs nobody anything.
 */

/** A document with one field, so a case is one field's worth of noise. */
function documentWith(field: Record<string, unknown>, specVersion = '2'): Record<string, unknown> {
  return {
    specVersion,
    id: 'widgets',
    title: 'Widgets',
    model: { fields: [{ key: 'answer', label: 'Answer', ...field }] },
  }
}

const errorsFor = (document: Record<string, unknown>): readonly string[] => {
  const result = validateSchema(document as never)
  // Narrowed on `valid` rather than reaching for `errors`: the result is a
  // discriminated union, and a valid document has no errors property at all.
  return result.valid ? [] : result.errors.map((error) => `${error.path} ${error.message}`)
}

describe('the widget list', () => {
  test('is closed, and every name belongs to at least one field type', () => {
    // A guard on the guard, and on a real mistake: a widget in the list that no
    // type accepts is a name an author can never use and a reviewer will assume
    // works.
    expect(FIELD_WIDGETS.length).toBeGreaterThan(0)
    for (const widget of FIELD_WIDGETS) {
      const accepting = Object.entries(WIDGETS_BY_FIELD_TYPE).filter(([, widgets]) =>
        (widgets as readonly string[]).includes(widget),
      )
      expect(accepting.length, `no field type accepts "${widget}"`).toBeGreaterThan(0)
    }
  })

  test('names no widget that is really a field type in disguise', () => {
    // The line, asserted rather than trusted. Each of these was requested as a
    // field type and is a widget only because the value shape is untouched; a
    // name here that changes what is collected has to move to FIELD_TYPES.
    expect([...FIELD_WIDGETS].sort()).toEqual([
      'datagrid',
      'scanner',
      // Several answers narrowed by typing, shown as chips. A field type in
      // everybody's first description of it, and a widget because the answer is
      // unchanged: still an array of offered option values, in the options' own
      // order, which is exactly what a `selectboxes` stores without it.
      'tagpicker',
      'toggle',
      'typeahead',
    ])
  })
})

describe('a widget on the type it belongs to', () => {
  // With the version each widget needs, because they do not all need the same one
  // any more: `tagpicker` arrived in 3 and the fixture defaults to 2, so a table
  // without this column asserts that the version gate is broken.
  test.each([
    ['checkbox', 'toggle', '2'],
    ['repeater', 'datagrid', '2'],
    ['select', 'typeahead', '2'],
    ['selectboxes', 'tagpicker', '3'],
    ['text', 'scanner', '2'],
  ])('%s accepts %s in spec %s', (type, widget, specVersion) => {
    const extra =
      type === 'repeater'
        ? { fields: [{ key: 'row', type: 'text', label: 'Row' }] }
        : type === 'select' || type === 'selectboxes'
          ? { options: [{ value: 'a', label: 'A' }] }
          : {}
    expect(errorsFor(documentWith({ type, widget, ...extra }, specVersion))).toEqual([])
  })
})

describe('a widget where it does not belong', () => {
  test('on a field type that has no such presentation is refused', () => {
    // Not silently dropped. An author who set `widget: "datagrid"` on a text
    // field believes they configured a grid, and a document that validates is a
    // document nobody tells them about.
    const errors = errorsFor(documentWith({ type: 'text', widget: 'datagrid' }))
    expect(errors.join('\n')).toMatch(/widget/i)
    expect(errors).not.toEqual([])
  })

  test('with a name nothing defines is refused, so a typo is an error', () => {
    // `togle` must not fall back to a tick-box in one renderer and a switch in
    // another. This is the assertion that makes the closed list worth its cost.
    const errors = errorsFor(documentWith({ type: 'checkbox', widget: 'togle' }))
    expect(errors).not.toEqual([])
  })

  test('in a version 1 document is refused by name, with the fix in the message', () => {
    // The version gate. A version 1 reader refuses the whole document rather
    // than ignoring the property, so a version 1 document may not carry one --
    // and the message has to say what to change, because the author cannot see
    // the other reader that would refuse it.
    const errors = errorsFor(documentWith({ type: 'checkbox', widget: 'toggle' }, '1'))
    expect(errors.join('\n')).toMatch(/widget/)
    expect(errors.join('\n')).toMatch(/specVersion "2"/)
  })
})

describe('a field with no widget', () => {
  test('is exactly as valid as it always was', () => {
    // The whole section is optional, which is what lets it land without
    // touching a single existing form.
    expect(errorsFor(documentWith({ type: 'checkbox' }))).toEqual([])
    expect(errorsFor(documentWith({ type: 'checkbox' }, '1'))).toEqual([])
  })
})
