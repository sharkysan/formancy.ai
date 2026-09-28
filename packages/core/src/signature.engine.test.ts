import { describe, expect, test } from 'vitest'
import type { FormSchema } from '@formancy/spec'
import { createFormEngine } from './engine.js'

/**
 * When a signature counts as given.
 *
 * The shape rules live beside the other model validators; this is the half that
 * belongs to the engine, because `required` is the engine's question. It matters
 * more here than on most fields: "sign here" is usually the one question on a
 * form that is not optional, and a field that accepts an empty mark as a
 * signature is a form that collects consent nobody gave.
 */
const engineFor = (required: boolean): ReturnType<typeof createFormEngine> => {
  const schema: FormSchema = {
    specVersion: '3',
    id: 'consent',
    title: 'Consent',
    model: { fields: [{ key: 'mark', type: 'signature', label: 'Sign here', required }] },
  }
  return createFormEngine({
    schema,
    capabilities: { now: () => 0, today: () => '2026-09-29', random: () => 0.5 },
  })
}

const errorsAfterSubmit = (engine: ReturnType<typeof createFormEngine>): string[] => {
  const outcome = engine.submit()
  return Object.values(outcome.errors ?? {}).flat().map(String)
}

describe('a required signature', () => {
  test('is not satisfied by an empty mark', () => {
    const engine = engineFor(true)

    engine.setValue(['mark'], { drawn: [] })

    expect(errorsAfterSubmit(engine).join(' ')).toMatch(/required/)
  })

  test('is not satisfied by a stroke with no points in it', () => {
    // How an empty canvas arrives when a pointer went down and came straight up:
    // one stroke, no points. It looks like an answer and is not one.
    const engine = engineFor(true)

    engine.setValue(['mark'], { drawn: [[]] })

    expect(errorsAfterSubmit(engine).join(' ')).toMatch(/required/)
  })

  test('is not satisfied by a name of spaces', () => {
    const engine = engineFor(true)

    engine.setValue(['mark'], { typed: '   ' })

    expect(errorsAfterSubmit(engine).join(' ')).toMatch(/required/)
  })

  test('is satisfied by a mark, and by a name', () => {
    const drawn = engineFor(true)
    drawn.setValue(['mark'], { drawn: [[[1, 1], [2, 2]]] })
    expect(errorsAfterSubmit(drawn)).toEqual([])

    const typed = engineFor(true)
    typed.setValue(['mark'], { typed: 'Mara Lindqvist' })
    expect(errorsAfterSubmit(typed)).toEqual([])
  })

  test('and an optional one left alone is not an error', () => {
    expect(errorsAfterSubmit(engineFor(false))).toEqual([])
  })
})
