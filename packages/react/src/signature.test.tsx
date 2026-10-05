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

describe('what happens after the pen lifts', () => {
  /*
   * Reported from the built playground: *"the signature in the playground is
   * cleared after signing"*. Measured there before a line was changed — one
   * stroke on screen after the mouse button came up, and NONE after the pointer
   * moved off the box.
   *
   * `pointerleave` was wired to the same handler as `pointerup`, which is right
   * for a pen that leaves the surface mid-stroke and wrong for one that has
   * already lifted: with nothing in progress the handler fell through to
   * `commit(before)`, and `before` is the strokes from before the LAST one. With
   * one stroke drawn that is nothing at all, so the answer went back to null.
   *
   * Every case already here moved the pointer and lifted it, which is the one
   * sequence that cannot show this. What a person does next is move their hand
   * away.
   */
  const drawOneStroke = (): void => {
    fireEvent.pointerDown(surface(), { clientX: 10, clientY: 10 })
    for (let step = 0; step < 12; step += 1) {
      fireEvent.pointerMove(surface(), { clientX: 10 + step * 4, clientY: 15 + step })
    }
    fireEvent.pointerUp(surface())
  }

  test('the mark survives the pointer leaving the surface afterwards', () => {
    const engine = mount()

    drawOneStroke()
    // The hand moves away. Nothing is in progress, so nothing should change.
    fireEvent.pointerLeave(surface())

    expect(answer(engine).drawn).toHaveLength(1)
  })

  test('and survives it happening twice, because a mouse can re-enter and leave', () => {
    const engine = mount()

    drawOneStroke()
    fireEvent.pointerLeave(surface())
    fireEvent.pointerEnter(surface())
    fireEvent.pointerLeave(surface())

    expect(answer(engine).drawn).toHaveLength(1)
  })

  test('while a pen that leaves mid-stroke still ends the stroke it was drawing', () => {
    // The reason `pointerleave` is wired up at all, and it must keep working: a
    // pointer that goes past the edge with the button down never sends
    // `pointerup` to this element, and without this the next press would append
    // to a stroke from a minute ago.
    const engine = mount()

    fireEvent.pointerDown(surface(), { clientX: 1, clientY: 1 })
    fireEvent.pointerMove(surface(), { clientX: 30, clientY: 30 })
    fireEvent.pointerMove(surface(), { clientX: 60, clientY: 60 })
    fireEvent.pointerLeave(surface())

    // Then a second stroke, which must be a second stroke rather than a
    // continuation of the first.
    fireEvent.pointerDown(surface(), { clientX: 90, clientY: 10 })
    fireEvent.pointerMove(surface(), { clientX: 120, clientY: 20 })
    fireEvent.pointerUp(surface())

    expect(answer(engine).drawn).toHaveLength(2)
  })

  test('and a tap that leaves without moving still counts as nothing', () => {
    // One point is a tap, not a stroke. The guard added for the bug above must
    // not have taken this with it: a tap on the way past is not signing.
    const engine = mount()

    fireEvent.pointerDown(surface(), { clientX: 5, clientY: 5 })
    fireEvent.pointerLeave(surface())

    expect(answer(engine).drawn).toBeUndefined()
  })
})

describe('signing with a finger, which is how most people will', () => {
  /*
   * Reported from an iPad: the control is unusable because the page scrolls
   * while you sign.
   *
   * A touch drag on a drawing surface is ambiguous — it could be a signature or
   * it could be a pan — and `touch-action` is how an element says which. Without
   * it the browser resolves the ambiguity in favour of scrolling, and it resolves
   * it in the compositor BEFORE the first event reaches this code, so no handler
   * can take it back.
   *
   * **It was only in the themes, and that is the bug.** All four set
   * `touch-action: none` on the surface, so drawing worked everywhere the demo
   * was looked at and nowhere else. Measured in Chromium with the attribute
   * removed from the host: `auto` on the surface, inside a pane whose overflow
   * is `auto` — a finger pans the pane instead of signing. The renderers ship no
   * CSS by design, so anything the control needs in order to *work* has to come
   * from the control.
   */
  test('declares that a drag on the surface is a signature, not a scroll', () => {
    mount()
    const surface = screen.getByRole('img', { name: 'Sign here' })

    expect(
      surface.style.touchAction,
      'the surface lets the browser treat a touch drag as a pan',
    ).toBe('none')
  })

  test('and prevents the pan itself, for a browser that did not honour that', () => {
    /*
     * The belt behind the braces, and the reason for it is honest: the device
     * this was reported on cannot be driven from here, and `touch-action` was
     * already doing its job in the one browser that can be. If it is honoured,
     * these events are not cancelable and this costs nothing; if it is not,
     * this is the only thing left that stops the scroll.
     *
     * Registered by hand rather than with `onTouchMove`, because React attaches
     * `touchstart` and `touchmove` at the root as **passive** listeners, where
     * `preventDefault` is ignored and logs a warning. A passive handler here
     * would look exactly like a fix and do nothing.
     */
    mount()
    const surface = screen.getByRole('img', { name: 'Sign here' })

    const move = new Event('touchmove', { bubbles: true, cancelable: true })
    surface.dispatchEvent(move)

    expect(move.defaultPrevented, 'a touchmove on the surface was left to scroll the page').toBe(true)
  })

  test('and leaves a touch outside the surface alone, so the form can still be scrolled', () => {
    // The whole form must stay scrollable with a finger. Cancelling touches
    // anywhere but the surface would trap the page, which is a worse bug than
    // the one being fixed and the obvious way to overshoot it.
    mount()

    const move = new Event('touchmove', { bubbles: true, cancelable: true })
    screen.getByRole('textbox', { name: 'Type your name' }).dispatchEvent(move)

    expect(move.defaultPrevented, 'touches away from the surface are being cancelled too').toBe(false)
  })
})
