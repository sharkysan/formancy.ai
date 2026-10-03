import { describe, expect, test } from 'vitest'
import { createFormEngine } from './engine.js'
import type { FormSchema } from '@formancy/spec'

/**
 * The same form twice on one page.
 *
 * Element ids are minted from `schema.id` — `f:order:email:control` — which is
 * what makes them deterministic and SSR-stable
 * ([0021](../../../docs/decisions/0021-engine-owns-aria.md)). It also means two
 * engines built from one schema produce **identical** ids, measured, so a page
 * showing one form twice emits every id twice.
 *
 * That is not cosmetic. A duplicate id breaks the two things the engine owns
 * these ids for: `<label for>` association picks the first match in the
 * document, and `aria-describedby` resolves to the first match too — so a
 * screen reader reading the second form's error announces the first form's, or
 * announces nothing. The renderers cannot see this, because each one is correct
 * about the tree it rendered.
 *
 * The case that found it is the playground showing React and Angular side by
 * side, which is the project's own v0.1 goal. But a host has the same problem
 * for an ordinary reason: two of the same form on one page, one per applicant.
 */
const schema: FormSchema = {
  specVersion: '1',
  id: 'order',
  title: 'Order',
  model: {
    fields: [
      { key: 'email', type: 'text', label: 'Email', required: true },
      { key: 'note', type: 'text', label: 'Note' },
    ],
  },
} as unknown as FormSchema

const capabilities = { now: () => 0, today: () => '2026-10-03', random: () => 0.5 }

const idsOf = (formId?: string): Record<string, string> => {
  const engine = createFormEngine({
    schema,
    capabilities,
    ...(formId === undefined ? {} : { formId }),
  })
  return { ...engine.getFieldSnapshot(['email']).ids }
}

describe('rendering one schema in two places at once', () => {
  test('takes a form id, so the two do not mint the same element ids', () => {
    const react = idsOf('react')
    const angular = idsOf('angular')

    expect(react['control']).toBe('f:react:email:control')
    expect(angular['control']).toBe('f:angular:email:control')
  })

  test('and every part is namespaced, not only the control', () => {
    // A label, a hint, a description and an error are all describedby targets
    // or `for` targets. One of them left un-namespaced is the same bug in a
    // less obvious place.
    const react = idsOf('react')
    const angular = idsOf('angular')

    for (const part of Object.keys(react)) {
      expect(react[part], part).not.toBe(angular[part])
    }
    expect(Object.keys(react).sort()).toEqual([
      'control',
      'description',
      'error',
      'hint',
      'label',
    ])
  })

  test('the default is still the schema id, so nothing already written changes', () => {
    // The ids are a published contract in the sense that matters: a host's
    // stylesheet, a test, or a `for` attribute somebody wrote by hand all name
    // them. Changing the default would be a breaking change for a feature
    // nobody asked for.
    expect(idsOf()['control']).toBe('f:order:email:control')
  })

  test('and the describedby wiring follows the override rather than the schema', () => {
    /*
     * The assertion that makes this worth having. Namespacing the ids while
     * leaving `aria-describedby` pointing at the schema's would be worse than
     * doing nothing: the attribute would resolve to the OTHER form's hint, and
     * both forms would validate as correct markup.
     */
    const engine = createFormEngine({ schema, capabilities, formId: 'angular' })
    engine.setValue(['email'], '')
    engine.submit()

    const snapshot = engine.getFieldSnapshot(['email'])
    expect(snapshot.errors.length).toBeGreaterThan(0)
    expect(snapshot.props.control['aria-describedby']).toBe('f:angular:email:error')
  })

  test('refuses a form id that would alias another field, when the engine is built', () => {
    /*
     * `:` is the separator, so a form id containing one can address another
     * field's id. `fieldIds` already rejects it — but lazily, when a field is
     * first rendered, which was also true of `schema.id` and is the wrong
     * moment: the caller passed this argument here, and a page that renders no
     * field until somebody scrolls would report it then.
     *
     * So the check runs once at construction, against the id this engine will
     * actually use. The lazy check stays where it is, because it is what makes
     * `fieldIds` safe for anybody else to call.
     */
    for (const bad of ['has:colon', 'has space']) {
      expect(() => createFormEngine({ schema, capabilities, formId: bad })).toThrow(/must not/)
    }

    // And the same mistake in the document is caught at the same moment, which
    // it was not before.
    expect(() =>
      createFormEngine({ schema: { ...schema, id: 'has:colon' }, capabilities }),
    ).toThrow(/must not/)
  })
})
