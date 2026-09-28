import { describe, expect, test } from 'vitest'

import { LAYOUT_LEAF_KINDS, SPEC_1_LAYOUT_KINDS, layoutChildren } from './types.js'
import { validateSchema } from './validate.js'

/**
 * A `qrcode` layout node — a picture of an answer the form already holds.
 *
 * **It collects nothing**, and that decides the mechanism. A field type would put a
 * non-answering entry in the model: a `key` that is an identity forever, a path in
 * `modelDataPaths`, a row in every `diffSchemas` result, a column in an exported CSV
 * that nobody ever filled in, and a target a computed rule could aim at. `static` is
 * the precedent for taking that cost and it is not one to follow — `static` predates
 * the `layouts` section, so it is history rather than a pattern.
 *
 * A **widget** is the other candidate and it is wrong for a different reason: a widget
 * sits on a field that collects. `widget: "qrcode"` on a text field would replace the
 * input with a picture, which changes what somebody may enter — over the line
 * [0065](../../../docs/decisions/0065-a-widget-is-authored-not-registered.md) draws.
 *
 * A layout node needs no field to hang off, already addresses fields by data path, and
 * already means "a presentation of the model rather than part of it". The scanning half
 * of the same request stays where it is: `scanner` is a widget on a field that collects
 * a string, because reading a code writes an answer and showing one writes nothing.
 *
 * `LayoutNode` had exactly two shapes: `field`, which carries a path and no children,
 * and everything else, which carries children. Fourteen places encoded that as
 * `node.kind === 'field' ? … : node.children`, and `isLayoutContainer` in
 * `@formancy/builder-core` stated it outright as `node.kind !== 'field'`.
 *
 * `qrcode` is the first childless node that is not a field, so every one of those
 * fourteen was about to become wrong — most of them as a compile error, which is the
 * good case, and some as a silent walk into `undefined`. So the assumption is now
 * named once, here, as `LAYOUT_LEAF_KINDS` and `layoutChildren`. The next childless
 * node is a one-line change instead of a fourteen-site change, which is the only
 * reason this refactor belongs in the same commit as the feature.
 */

function documentWith(nodes: unknown[], specVersion = '2'): Record<string, unknown> {
  return {
    specVersion,
    id: 'pass',
    title: 'Pass',
    model: { fields: [{ key: 'code', type: 'text', label: 'Code' }] },
    layouts: [{ name: 'web', nodes }],
  }
}

const errorsFor = (document: Record<string, unknown>): readonly string[] => {
  const result = validateSchema(document as never)
  return result.valid ? [] : result.errors.map((error) => `${error.path} ${error.message}`)
}

describe('the leaf kinds', () => {
  test('name every layout node that has no children', () => {
    // The assumption, stated once. A kind missing from here is a kind fourteen
    // walkers will try to read `children` from.
    expect([...LAYOUT_LEAF_KINDS].sort()).toEqual(['field', 'qrcode'])
  })

  test('layoutChildren returns nothing for a leaf and the children of a container', () => {
    expect(layoutChildren({ kind: 'field', path: 'code' })).toEqual([])
    expect(layoutChildren({ kind: 'qrcode', path: 'code' })).toEqual([])
    const child = { kind: 'field', path: 'code' } as const
    expect(layoutChildren({ kind: 'section', children: [child] })).toEqual([child])
  })

  test('is not a version 1 kind', () => {
    expect(SPEC_1_LAYOUT_KINDS).not.toContain('qrcode')
  })
})

describe('a qrcode node', () => {
  test('encodes a path the model has', () => {
    expect(errorsFor(documentWith([{ kind: 'qrcode', path: 'code', label: 'Your pass' }]))).toEqual(
      [],
    )
  })

  test('is refused when the path names nothing', () => {
    // The same rule a field placement already gets, and for the same reason: a node
    // that places nothing renders an empty box, which reads as a broken form rather
    // than as a typo in the layout.
    const errors = errorsFor(documentWith([{ kind: 'qrcode', path: 'nope', label: 'A code' }]))
    expect(errors.join('\n')).toMatch(/nope/)
  })

  test('holds no children, and is refused if given any', () => {
    // The union's invariant, enforced rather than trusted: a childless node that
    // accepted children would be a node fourteen walkers disagree about.
    const errors = errorsFor(
      documentWith([
        { kind: 'qrcode', path: 'code', label: 'A code', children: [{ kind: 'field', path: 'code' }] },
      ]),
    )
    expect(errors).not.toEqual([])
  })

  test('in a version 1 document is refused by name, with the fix in the message', () => {
    const errors = errorsFor(documentWith([{ kind: 'qrcode', path: 'code', label: 'A code' }], '1'))
    expect(errors.join('\n')).toMatch(/qrcode/)
    expect(errors.join('\n')).toMatch(/specVersion "2"/)
  })

  test('may carry a label, which is what a reader is told the code is', () => {
    // A picture of a code says nothing to a screen reader, so the node's label and the
    // value behind it are the accessible content. Optional, because a code beside the
    // field it encodes needs no second name.
    expect(
      errorsFor(documentWith([{ kind: 'qrcode', path: 'code', label: 'Your pass' }])),
    ).toEqual([])
  })

  test('does not add a field to the model', () => {
    // The whole reason it is a layout node. If this ever fails, the construct has
    // become a field type by accident and every consequence in the file header
    // applies: a CSV column nobody filled in, a diff entry, a computed-rule target.
    const result = validateSchema(
      documentWith([{ kind: 'qrcode', path: 'code', label: 'Your pass' }]) as never,
    )
    expect(result.valid).toBe(true)
    if (!result.valid) return
    expect(result.schema.model.fields.map((field) => field.key)).toEqual(['code'])
  })
})

describe('a code says what it is', () => {
  test('refuses a code with no label, because the label IS its accessible content', () => {
    // 0070 says the picture is decoration and the value is the content — and a bare
    // value is a booking reference announced with nothing to say what it is. The value
    // sits in an `<output>`, which is a live region, so it is announced whenever the
    // answer changes.
    //
    // Found by review before the beta, and the builder was the worst offender: it
    // inserted `{ kind: 'qrcode', path }` with no label at all, so every code node
    // anybody made this way was unnamed.
    const errors = errorsFor(documentWith([{ kind: 'qrcode', path: 'code' }]))

    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('/layouts/0/nodes/0/label')
    expect(errors[0]).toContain('read aloud')
  })
})
