import { useRef } from 'react'
import { useField } from '../use-field.js'
import { FieldShell } from './internals.js'
import type { FieldComponentProps, SignatureAnswerValue } from './internals.js'


/**
 * The signature control: a mark drawn, or a name typed.
 *
 * One file per control, because a control changes for its own reasons.
 * These were one 2,154-line file — the largest in the repository.
 */
/**
 * Sign here: draw a mark, or type your name.
 *
 * **Both routes are the feature, not a fallback and its apology.** Typing your
 * name is how most people sign most things, and it is the only route a keyboard
 * has — a field that offered drawing alone would be a WCAG 2.1.1 failure with a
 * legal signature attached to it. So the two sit side by side and the last one
 * used is the answer; they are never both present, because a reader choosing
 * between them is a signed document that renders differently depending on the
 * choice.
 *
 * **SVG, not canvas.** A canvas answer would be pixels, and this stores points
 * ([0083](../../../docs/decisions/0083-a-signature-is-points-or-a-name.md)):
 * points scale, diff, survive a re-render and mean something to a reader that is
 * not a browser. Drawing them as an SVG path costs nothing extra and makes the
 * mark visible to anything that can read the DOM, including a test.
 *
 * **No stroke timing.** Velocity is what makes a signature biometric, and
 * biometric data is a category (GDPR Article 9) nothing here is equipped to
 * hold.
 */
export function SignatureField({ path, label }: FieldComponentProps) {
  const field = useField(path)
  const answer = (typeof field.value === 'object' && field.value !== null
    ? field.value
    : {}) as SignatureAnswerValue
  const drawn = answer.drawn ?? []
  const [width, height] = field.def?.box ?? [600, 200]

  const surface = useRef<SVGSVGElement | null>(null)
  const stroke = useRef<Array<[number, number]> | null>(null)
  /**
   * The strokes finished before this one started.
   *
   * Held rather than read back from the value, which is what the first version
   * did — and the value already contains the stroke in progress, so every move
   * appended another one. A signature drawn in the playground came out as forty
   * strokes of a single point each; the unit tests moved once per stroke, which
   * is the one shape that cannot show it.
   */
  const before = useRef<Array<Array<[number, number]>>>([])

  /**
   * A client point in the field's own coordinate space, rounded to whole numbers.
   *
   * Whole numbers because the canonical hash a submission is bound to must not
   * depend on how a browser rounded a pointer event. Clamped, because a pointer
   * that leaves the box mid-stroke would otherwise record a point the engine
   * refuses — the answer being invalid is the right outcome for a hand-written
   * payload and the wrong one for somebody whose hand went past the edge.
   */
  const pointFrom = (event: { clientX: number; clientY: number }): [number, number] => {
    const rect = surface.current?.getBoundingClientRect()
    // jsdom, and anything else that has not laid out yet, measures zero. Falling
    // back to the raw offset keeps the stroke recordable rather than dividing by
    // nothing.
    const scaleX = rect === undefined || rect.width === 0 ? 1 : width / rect.width
    const scaleY = rect === undefined || rect.height === 0 ? 1 : height / rect.height
    const x = (event.clientX - (rect?.left ?? 0)) * scaleX
    const y = (event.clientY - (rect?.top ?? 0)) * scaleY
    return [
      Math.max(0, Math.min(width, Math.round(x))),
      Math.max(0, Math.min(height, Math.round(y))),
    ]
  }

  const commit = (strokes: Array<Array<[number, number]>>): void => {
    // Nothing drawn is NOT `{ drawn: [] }`: an empty mark presented as an answer
    // is what would let a required signature be satisfied by signing nothing.
    field.setValue(strokes.length === 0 ? null : { drawn: strokes })
  }

  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>): void => {
    before.current = drawn
    stroke.current = [pointFrom(event)]
    // Not in jsdom, and not on a mouse that never left the element.
    surface.current?.setPointerCapture?.(event.pointerId)
  }

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>): void => {
    if (stroke.current === null) return
    stroke.current = [...stroke.current, pointFrom(event)]
    // Drawn as it goes: a mark that only appears when the pen lifts reads as a
    // surface that is not listening.
    commit([...before.current, stroke.current])
  }

  const onPointerUp = (): void => {
    const finished = stroke.current
    // Nothing in progress, so nothing to end. `pointerleave` shares this handler
    // — which is what ends a stroke whose pen went past the edge without ever
    // sending `pointerup` here — and it fires AGAIN once the pen has already
    // lifted, when `before` holds the strokes from before the last one. Falling
    // through to `commit(before)` then threw away the stroke just drawn.
    //
    // Measured in the built playground, because the sequence every test here used
    // was down, move, up — and the thing a person does next is move their hand
    // away: one stroke on screen after the button came up, and none once the
    // mouse left the box.
    if (finished === null) return
    stroke.current = null
    // One point is a tap, not a stroke, and a tap on the way past should not
    // count as having signed — so the strokes from before it are what remains.
    if (finished.length < 2) commit(before.current)
  }

  return (
    <FieldShell path={path} field={field} label={label}>
      <div data-formancy-part="signature">
        <svg
          ref={surface}
          data-formancy-part="signature-surface"
          viewBox={`0 0 ${String(width)} ${String(height)}`}
          // A graphic with a name, not a control: the things that take input are
          // the box and the button beside it, and claiming otherwise would put a
          // control in the tab order that a keyboard cannot use.
          role="img"
          aria-label={label}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          {drawn.map((points, at) => (
            <path
              // Index: strokes are appended and never reordered, and a stroke has
              // no identity of its own to key by.
              key={at}
              data-formancy-part="signature-stroke"
              d={points.map(([x, y], step) => `${step === 0 ? 'M' : 'L'}${String(x)} ${String(y)}`).join(' ')}
              fill="none"
            />
          ))}
        </svg>

        <input
          data-formancy-part="signature-typed"
          type="text"
          value={answer.typed ?? ''}
          aria-label="Type your name"
          onChange={(event) => {
            const typed = event.target.value
            field.setValue(typed === '' ? null : { typed })
          }}
          onBlur={field.touch}
        />

        <button
          data-formancy-part="signature-clear"
          type="button"
          onClick={() => {
            stroke.current = null
            before.current = []
            field.setValue(null)
          }}
        >
          Clear
        </button>
      </div>
    </FieldShell>
  )
}
