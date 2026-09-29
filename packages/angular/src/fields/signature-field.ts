import { ChangeDetectionStrategy, Component, computed, input, viewChild } from '@angular/core'
import type { ElementRef, Type } from '@angular/core'
import { FieldComponentBase, FormancyFieldShell } from './field-shell.js'


/**
 * The signature control: a mark drawn, or a name typed.
 *
 * One file per control, because a control changes for its own reasons.
 * These were one 1,909-line file — the second largest in the repository,
 * and the place things went.
 */
/**
 * Sign here: draw a mark, or type your name.
 *
 * The same control as the React one, part for part, because a theme dresses both
 * through the same `data-formancy-part` names and a renderer that emitted
 * different ones would need its own stylesheet
 * ([0083](../../../docs/decisions/0083-a-signature-is-points-or-a-name.md)).
 *
 * Typing is the keyboard route and is not a lesser one: a field offering drawing
 * alone would be a WCAG 2.1.1 failure with a legal signature attached to it.
 * SVG rather than canvas because the answer is points, and points can be drawn
 * declaratively — a canvas would hold pixels the answer does not contain.
 */
@Component({
  selector: 'formancy-signature-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormancyFieldShell],
  template: `
    <formancy-field-shell [field]="field" [label]="context.label" [path]="context.path">
      <div data-formancy-part="signature">
        <svg
          #surface
          data-formancy-part="signature-surface"
          [attr.viewBox]="viewBox()"
          role="img"
          [attr.aria-label]="context.label"
          (pointerdown)="onDown($event)"
          (pointermove)="onMove($event)"
          (pointerup)="onUp()"
          (pointerleave)="onUp()"
        >
          @for (stroke of strokes(); track $index) {
            <path data-formancy-part="signature-stroke" [attr.d]="pathOf(stroke)" fill="none" />
          }
        </svg>

        <input
          data-formancy-part="signature-typed"
          type="text"
          aria-label="Type your name"
          [value]="typed()"
          (input)="onTyped($event)"
          (blur)="field.touch()"
        />

        <button data-formancy-part="signature-clear" type="button" (click)="clear()">Clear</button>
      </div>
    </formancy-field-shell>
  `,
})
export class FormancySignatureField extends FieldComponentBase {
  private readonly surface = viewChild<ElementRef<SVGSVGElement>>('surface')
  private stroke: Array<[number, number]> | null = null
  /** The strokes finished before this one started. Held rather than read back
   *  from the value, which already contains the stroke in progress — reading it
   *  made every pointer move append another stroke, so one signature came out as
   *  forty of a single point each. */
  private before: Array<Array<[number, number]>> = []

  private readonly answer = computed(() => {
    const value = this.field.snapshot().value
    return (typeof value === 'object' && value !== null ? value : {}) as {
      drawn?: Array<Array<[number, number]>>
      typed?: string
    }
  })

  protected readonly strokes = computed(() => this.answer().drawn ?? [])
  protected readonly typed = computed(() => this.answer().typed ?? '')
  private readonly box = computed<[number, number]>(() => this.field.snapshot().def.box ?? [600, 200])
  protected readonly viewBox = computed(() => `0 0 ${String(this.box()[0])} ${String(this.box()[1])}`)

  protected pathOf(points: ReadonlyArray<readonly [number, number]>): string {
    return points
      .map(([x, y], step) => `${step === 0 ? 'M' : 'L'}${String(x)} ${String(y)}`)
      .join(' ')
  }

  protected onDown(event: PointerEvent): void {
    this.before = [...this.strokes()]
    this.stroke = [this.pointFrom(event)]
    this.surface()?.nativeElement.setPointerCapture?.(event.pointerId)
  }

  protected onMove(event: PointerEvent): void {
    if (this.stroke === null) return
    this.stroke = [...this.stroke, this.pointFrom(event)]
    this.commit([...this.before, this.stroke])
  }

  protected onUp(): void {
    const finished = this.stroke
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
    this.stroke = null
    // One point is a tap on the way past, not a signature.
    if (finished.length < 2) this.commit(this.before)
  }

  protected onTyped(event: Event): void {
    const typed = (event.target as HTMLInputElement).value
    this.field.setValue(typed === '' ? null : { typed })
  }

  protected clear(): void {
    this.stroke = null
    this.before = []
    this.field.setValue(null)
  }

  /** A client point in the field's own space, whole-numbered and clamped. */
  private pointFrom(event: PointerEvent): [number, number] {
    const rect = this.surface()?.nativeElement.getBoundingClientRect()
    const [width, height] = this.box()
    const scaleX = rect === undefined || rect.width === 0 ? 1 : width / rect.width
    const scaleY = rect === undefined || rect.height === 0 ? 1 : height / rect.height
    const x = (event.clientX - (rect?.left ?? 0)) * scaleX
    const y = (event.clientY - (rect?.top ?? 0)) * scaleY
    return [
      Math.max(0, Math.min(width, Math.round(x))),
      Math.max(0, Math.min(height, Math.round(y))),
    ]
  }

  /** Nothing drawn is `null`, never `{ drawn: [] }`: an empty mark presented as
   *  an answer is what would satisfy a required signature with no signature. */
  private commit(strokes: Array<Array<[number, number]>>): void {
    this.field.setValue(strokes.length === 0 ? null : { drawn: strokes })
  }
}
