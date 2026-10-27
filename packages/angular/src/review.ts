import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, output, viewChild } from '@angular/core'
import { answersToReview } from '@formancy/core/words'
import type { ReviewedAnswer } from '@formancy/core/words'
import { injectEngine } from './provide.js'
import { injectFormText } from './text.js'

let nextId = 0

/**
 * The answers in words before they are sent (0204) — the React binding's `Review`, row for row,
 * since both draw `answersToReview`. Each "Change" names its question for a screen reader, focus
 * is on the heading when it opens, and what sends the form is projected in.
 */
@Component({
  selector: 'formancy-review',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section data-formancy-part="review" [attr.aria-labelledby]="headingId">
      <h2 #heading [id]="headingId" tabindex="-1" data-formancy-part="review-heading">{{ text('review.heading') }}</h2>
      @if (answers().length === 0) {
        <p data-formancy-part="review-empty">{{ text('review.empty') }}</p>
      } @else {
        <dl data-formancy-part="review-answers">
          @for (answer of answers(); track answer.path) {
            <div data-formancy-part="review-answer">
              <dt>{{ answer.label }}</dt>
              <dd>{{ answer.said }}</dd>
              <dd><button type="button" (click)="changed.emit(answer)">{{ text('review.change') }} <span data-formancy-part="visually-hidden">{{ answer.label }}</span></button></dd>
            </div>
          }
        </dl>
      }
      <ng-content />
    </section>
  `,
})
export class FormancyReview {
  /** Leave the review for this answer's question. */
  readonly changed = output<ReviewedAnswer>()

  private readonly engine = injectEngine()
  protected readonly text = injectFormText()
  protected readonly headingId = `formancy-review-${String((nextId += 1))}`
  protected readonly answers = computed(() => answersToReview(this.engine, this.text))
  private readonly heading = viewChild.required<ElementRef<HTMLHeadingElement>>('heading')

  constructor() {
    afterNextRender(() => this.heading().nativeElement.focus())
  }
}
