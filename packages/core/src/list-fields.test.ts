import { describe, expect, test } from 'vitest'
import { createFormEngine } from './engine.js'
import { parsePath } from './path.js'
import type { FormSchema } from '@formancy/spec'

/**
 * The field types whose answer is a list: `selectboxes` and `file`.
 *
 * They share one idea and it is worth testing once rather than twice: "how
 * many" is the same question whether it is asked about ticks or attachments,
 * so both use `minItems` and `maxItems`, the same two properties a repeater
 * uses. The rest is about what an empty list means, which is the case every
 * implementation gets wrong first.
 */
const CAPABILITIES = {
  now: () => 0,
  today: () => '2026-09-22',
  random: () => 0.5,
}

const engineFor = (fields: FormSchema['model']['fields']) =>
  createFormEngine({
    schema: {
      specVersion: '2',
      id: 'lists',
      title: 'Lists',
      model: { fields },
    },
    capabilities: CAPABILITIES,
  })

const errorsOn = (engine: ReturnType<typeof engineFor>, wire: string): readonly string[] =>
  engine.getFieldSnapshot(parsePath(wire)).errors

describe('selectboxes', () => {
  const topics = (over: Record<string, unknown> = {}) => [
    {
      key: 'topics',
      type: 'selectboxes' as const,
      label: 'Topics',
      options: [
        { value: 'news', label: 'News' },
        { value: 'offers', label: 'Offers' },
        { value: 'events', label: 'Events' },
      ],
      ...over,
    },
  ]

  test('the answer is the list of values ticked', () => {
    const engine = engineFor(topics())

    engine.setValue(parsePath('topics'), ['news', 'events'])

    expect(engine.value()).toEqual({ topics: ['news', 'events'] })
  })

  test('required means at least one tick, and an empty list is not one', () => {
    const engine = engineFor(topics({ required: true }))

    engine.setValue(parsePath('topics'), [])
    engine.submit()

    // `[]` is how a selectboxes field with nothing ticked arrives, and it is
    // not an answer. Treating it as one is the bug every implementation has
    // to be told about.
    expect(errorsOn(engine, 'topics')).toContain('required')
  })

  test('required is satisfied by one tick', () => {
    const engine = engineFor(topics({ required: true }))

    engine.setValue(parsePath('topics'), ['news'])
    engine.submit()

    expect(errorsOn(engine, 'topics')).toEqual([])
  })

  test('minItems and maxItems bound how many may be ticked', () => {
    const engine = engineFor(topics({ minItems: 2, maxItems: 2 }))

    engine.setValue(parsePath('topics'), ['news'])
    engine.submit()
    expect(errorsOn(engine, 'topics')).toContain('minItems')

    engine.setValue(parsePath('topics'), ['news', 'offers', 'events'])
    engine.submit()
    expect(errorsOn(engine, 'topics')).toContain('maxItems')

    engine.setValue(parsePath('topics'), ['news', 'offers'])
    engine.submit()
    expect(errorsOn(engine, 'topics')).toEqual([])
  })

  test('a bound is not a requirement: an untouched optional field trips nothing', () => {
    const engine = engineFor(topics({ minItems: 2 }))

    engine.submit()

    // Emptiness is `required`'s job alone. Otherwise an author has to write
    // "unless it is empty" into every bound they set.
    expect(errorsOn(engine, 'topics')).toEqual([])
  })

  test('a scalar where a list belongs fails rather than sailing through', () => {
    const engine = engineFor(topics({ maxItems: 1 }))

    // The hostile-payload path: `'news'.length` is 4, so a naive bound would
    // reject a single valid choice and accept a thousand-character string.
    engine.setValue(parsePath('topics'), 'news')
    engine.submit()

    expect(errorsOn(engine, 'topics')).toContain('type')
  })
})

describe('file', () => {
  const pdf = { id: 'f1', name: 'report.pdf', size: 1024, contentType: 'application/pdf', storageKey: 'k1' }
  const png = { id: 'f2', name: 'shot.PNG', size: 9_000_000, contentType: 'image/png', storageKey: 'k2' }

  const evidence = (over: Record<string, unknown> = {}) => [
    { key: 'evidence', type: 'file' as const, label: 'Evidence', ...over },
  ]

  test('the answer is what each file is and where it went, never its bytes', () => {
    const engine = engineFor(evidence())

    engine.setValue(parsePath('evidence'), [pdf])

    expect(engine.value()).toEqual({ evidence: [pdf] })
  })

  test.each([null, 1, 'file', [], {}, { ...pdf, size: undefined },
    { ...pdf, size: -1 }, { ...pdf, size: 1.5 }, { ...pdf, size: Infinity },
    { ...pdf, id: '' }, { ...pdf, storageKey: undefined }, { ...pdf, contentType: null },
  ])('malformed attachment metadata is rejected without throwing: %j', (file) => {
    for (const constraints of [{}, { maxFileSize: 100 }, { accept: ['application/pdf'] }]) {
      const engine = engineFor(evidence(constraints))
      engine.setValue(parsePath('evidence'), [file])
      expect(engine.submit().errors['evidence']).toContain('type')
    }
  })

  test('maxFileSize is checked here, not only by the browser', () => {
    const engine = engineFor(evidence({ maxFileSize: 5_000_000 }))

    engine.setValue(parsePath('evidence'), [png])
    engine.submit()

    // A picker's limit is a convenience for the person filling the form in and
    // nothing at all to somebody posting to the endpoint directly.
    expect(errorsOn(engine, 'evidence')).toContain('maxFileSize')
  })

  test('accept matches a media type', () => {
    const engine = engineFor(evidence({ accept: ['application/pdf'] }))

    engine.setValue(parsePath('evidence'), [pdf])
    engine.submit()
    expect(errorsOn(engine, 'evidence')).toEqual([])

    engine.setValue(parsePath('evidence'), [png])
    engine.submit()
    expect(errorsOn(engine, 'evidence')).toContain('accept')
  })

  test('accept matches an extension, ignoring case', () => {
    const engine = engineFor(evidence({ accept: ['.png'] }))

    engine.setValue(parsePath('evidence'), [png])
    engine.submit()

    expect(errorsOn(engine, 'evidence')).toEqual([])
  })

  test('accept matches a wildcard subtype', () => {
    const engine = engineFor(evidence({ accept: ['image/*'] }))

    engine.setValue(parsePath('evidence'), [png])
    engine.submit()
    expect(errorsOn(engine, 'evidence')).toEqual([])

    engine.setValue(parsePath('evidence'), [pdf])
    engine.submit()
    expect(errorsOn(engine, 'evidence')).toContain('accept')
  })

  test('one unacceptable file is enough to fail the field', () => {
    const engine = engineFor(evidence({ accept: ['application/pdf'] }))

    engine.setValue(parsePath('evidence'), [pdf, png])
    engine.submit()

    expect(errorsOn(engine, 'evidence')).toContain('accept')
  })

  test('required means at least one attachment', () => {
    const engine = engineFor(evidence({ required: true }))

    engine.setValue(parsePath('evidence'), [])
    engine.submit()

    expect(errorsOn(engine, 'evidence')).toContain('required')
  })
})

describe('richtext', () => {
  test('the answer is a string, bounded by maxLength like any other text', () => {
    const engine = engineFor([
      { key: 'notes', type: 'richtext', label: 'Notes', maxLength: 10 },
    ])

    engine.setValue(parsePath('notes'), '**far** too long to fit')
    engine.submit()

    expect(errorsOn(engine, 'notes')).toContain('maxLength')
  })

  test('it is counted in the stored markup, which is what the cap protects', () => {
    const engine = engineFor([
      { key: 'notes', type: 'richtext', label: 'Notes', maxLength: 8 },
    ])

    // Four characters of text, eight of markup. The cap exists to bound what
    // is stored and sent, so it counts what is stored and sent.
    engine.setValue(parsePath('notes'), '**bold**')
    engine.submit()
    expect(errorsOn(engine, 'notes')).toEqual([])

    engine.setValue(parsePath('notes'), '**bolder**')
    engine.submit()
    expect(errorsOn(engine, 'notes')).toContain('maxLength')
  })
})

/**
 * What a rule sees before anybody has ticked anything.
 *
 * The case every implementation gets wrong first, and the one that is
 * invisible until a form uses it: an empty list answer is `[]`, and CEL is
 * unforgiving about the difference. `'a' in topics` is false against an empty
 * list and an ERROR against null — and a visibility rule that errors fails
 * OPEN, on purpose, so the field it was meant to hide is shown instead. The
 * form looks like the rule is inverted, not like the rule is broken.
 */
describe('an untouched list answer is an empty list, not nothing', () => {
  const withRule = (type: 'selectboxes' | 'file') =>
    createFormEngine({
      schema: {
        specVersion: '2',
        id: 'lists',
        title: 'Lists',
        model: {
          fields: [
            {
              key: 'topics',
              type,
              label: 'Topics',
              ...(type === 'selectboxes'
                ? { options: [{ value: 'migration', label: 'Migration' }] }
                : {}),
            },
            { key: 'detail', type: 'text', label: 'Detail' },
          ],
        },
        logic: {
          rules: [{ target: 'detail', kind: 'visible', cel: "'migration' in topics" }],
        },
      },
      capabilities: CAPABILITIES,
    })

  test('a rule over a selectboxes field hides before the first tick', () => {
    const engine = withRule('selectboxes')

    expect(engine.getFieldSnapshot(parsePath('detail')).visible).toBe(false)

    engine.setValue(parsePath('topics'), ['migration'])

    expect(engine.getFieldSnapshot(parsePath('detail')).visible).toBe(true)
  })

  test('and over a file field, before the first attachment', () => {
    // `file` holds objects rather than strings, but the shape of the mistake
    // is identical, so the fix has to cover both or it covers neither.
    expect(withRule('file').getFieldSnapshot(parsePath('detail')).visible).toBe(false)
  })

  test('the empty list is what the expression is handed, not a stand-in', () => {
    const engine = createFormEngine({
      schema: {
        specVersion: '2',
        id: 'lists',
        title: 'Lists',
        model: {
          fields: [
            { key: 'topics', type: 'selectboxes', label: 'Topics', options: [] },
            { key: 'count', type: 'number', label: 'Count' },
          ],
        },
        logic: { rules: [{ target: 'count', kind: 'computed', cel: 'size(topics)' }] },
      },
      capabilities: CAPABILITIES,
    })

    // `size(null)` has no overload, so a computed rule would write nothing and
    // the field would sit empty with no explanation anywhere.
    expect(engine.getFieldSnapshot(parsePath('count')).value).toBe(0)
  })
})
