import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createFormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { FormancyForm } from './form.js'
import { FormancyProvider } from './context.js'

/**
 * The signature control.
 *
 * Two routes to one answer, and the second is not a consolation prize: typing
 * your name is how most people sign most things, and it is the only route
 * available from a keyboard. A field that offered drawing alone would be a WCAG
 * 2.1.1 failure with a legal signature attached to it
 * ([0083](../../../docs/decisions/0083-a-signature-is-points-or-a-name.md)).
 *
 * jsdom has no layout, so every element measures zero. That decides what these
 * cases can ask: they hold what is *recorded* — a stroke happened, its points
 * are whole numbers, clearing empties it — and not where on the surface a point
 * landed, which no test here can see.
 */
afterEach(cleanup)

const schema: FormSchema = {
  specVersion: '3',
  id: 'consent',
  title: 'Consent',
  model: {
    fields: [{ key: 'mark', type: 'signature', label: 'Sign here', box: [600, 200] }],
  },
}

const mount = (): ReturnType<typeof createFormEngine> => {
  const engine = createFormEngine({
    schema,
    capabilities: { now: () => 0, today: () => '2026-09-29', random: () => 0.5 },
  })
  render(
    <FormancyProvider engine={engine}>
      <FormancyForm onSubmit={() => undefined} />
    </FormancyProvider>,
  )
  return engine
}

const surface = (): HTMLElement => screen.getByRole('img', { name: /sign here/i })
const answer = (engine: ReturnType<typeof createFormEngine>): Record<string, unknown> =>
  (engine.value() as Record<string, Record<string, unknown>>).mark ?? {}

describe('signing by drawing', () => {
  test('a stroke is one stroke however many times the pointer moves', () => {
    /*
     * Several moves, because one move hid a real bug: each move appended a new
     * stroke instead of extending the one in progress, so a signature drawn in
     * the playground came out as forty strokes of one point each. Two of these
     * cases passed the whole time — a stroke made of a single move is the one
     * shape the defect could not show up in.
     */
    const engine = mount()

    fireEvent.pointerDown(surface(), { clientX: 10, clientY: 10 })
    for (let step = 0; step < 12; step += 1) {
      fireEvent.pointerMove(surface(), { clientX: 10 + step * 4, clientY: 15 + step })
    }
    fireEvent.pointerUp(surface())

    expect(answer(engine).drawn).toHaveLength(1)
    expect((answer(engine).drawn as number[][][])[0]).toHaveLength(13)
  })

  test('a stroke is recorded as points, not as a picture', () => {
    const engine = mount()

    fireEvent.pointerDown(surface(), { clientX: 10, clientY: 10 })
    fireEvent.pointerMove(surface(), { clientX: 20, clientY: 15 })
    fireEvent.pointerUp(surface())

    const drawn = answer(engine).drawn as number[][][]
    expect(drawn).toHaveLength(1)
    expect(drawn[0]?.length).toBeGreaterThan(1)
    // Whole numbers: a submission is bound to a canonical hash, and that hash
    // must not depend on how a browser rounded a pointer event.
    for (const [x, y] of drawn[0] ?? []) {
      expect(Number.isInteger(x)).toBe(true)
      expect(Number.isInteger(y)).toBe(true)
    }
  })

  test('moving with no button down draws nothing', () => {
    const engine = mount()

    fireEvent.pointerMove(surface(), { clientX: 30, clientY: 30 })

    expect(answer(engine).drawn).toBeUndefined()
  })

  test('two strokes are two strokes, so a lifted pen is a gap', () => {
    const engine = mount()

    fireEvent.pointerDown(surface(), { clientX: 1, clientY: 1 })
    fireEvent.pointerMove(surface(), { clientX: 2, clientY: 2 })
    fireEvent.pointerUp(surface())
    fireEvent.pointerDown(surface(), { clientX: 8, clientY: 8 })
    fireEvent.pointerMove(surface(), { clientX: 9, clientY: 9 })
    fireEvent.pointerUp(surface())

    expect(answer(engine).drawn).toHaveLength(2)
  })

  test('clearing it empties the answer rather than leaving an empty mark', () => {
    const engine = mount()
    fireEvent.pointerDown(surface(), { clientX: 1, clientY: 1 })
    fireEvent.pointerMove(surface(), { clientX: 2, clientY: 2 })
    fireEvent.pointerUp(surface())

    fireEvent.click(screen.getByRole('button', { name: /clear/i }))

    // `null`, not `{ drawn: [] }`: an empty mark presented as an answer is what
    // makes a required signature satisfiable by signing nothing.
    expect((engine.value() as Record<string, unknown>).mark ?? null).toBeNull()
  })
})

describe('signing by typing, which is the keyboard route', () => {
  test('the name is the answer, and it replaces the mark', async () => {
    const user = userEvent.setup()
    const engine = mount()

    await user.type(screen.getByRole('textbox', { name: /type your name/i }), 'Mara')

    expect(answer(engine)).toEqual({ typed: 'Mara' })
  })

  test('drawing after typing replaces the name, so the two never both exist', () => {
    const engine = mount()
    fireEvent.change(screen.getByRole('textbox', { name: /type your name/i }), {
      target: { value: 'Mara' },
    })

    fireEvent.pointerDown(surface(), { clientX: 1, clientY: 1 })
    fireEvent.pointerMove(surface(), { clientX: 2, clientY: 2 })
    fireEvent.pointerUp(surface())

    // A reader choosing which of the two to show is a signed document that
    // renders differently depending on the choice.
    expect(answer(engine).typed).toBeUndefined()
    expect(answer(engine).drawn).toBeDefined()
  })

  test('is reachable with the keyboard alone, which drawing can never be', async () => {
    const user = userEvent.setup()
    mount()

    // Every control in the field, in tab order, without touching a pointer.
    await user.tab()
    const reached: string[] = []
    for (let step = 0; step < 4; step += 1) {
      const active = document.activeElement
      if (active !== null && active !== document.body) reached.push(active.tagName.toLowerCase())
      await user.tab()
    }

    expect(reached).toContain('input')
  })
})

describe('what the field says it is', () => {
  test('the surface is named, and is not a control that claims to take text', () => {
    mount()

    // An unlabelled drawing area is an unlabelled control. `img` with a name is
    // what a non-interactive graphic is, and the interactive parts beside it —
    // the box and the button — are the things that take input.
    expect(surface()).toBeTruthy()
    expect(surface().tagName.toLowerCase()).toBe('svg')
  })

  test('every part a theme has to dress carries its name', () => {
    mount()

    const parts = [...document.querySelectorAll('[data-formancy-part]')].map((element) =>
      element.getAttribute('data-formancy-part'),
    )
    expect(parts).toContain('signature')
    expect(parts).toContain('signature-surface')
    expect(parts).toContain('signature-typed')
    expect(parts).toContain('signature-clear')
  })
})
