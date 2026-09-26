import {
  ChangeDetectionStrategy,
  Component,
  afterRenderEffect,
  computed,
  input,
  viewChild,
} from '@angular/core'
import type { ElementRef } from '@angular/core'

/**
 * Telling somebody their draft came back changed.
 *
 * The same component the React binding has, word for word in what it says,
 * because the two renderers agreeing about what a form TELLS somebody matters as
 * much as them agreeing about what it collects.
 *
 * The server already does the careful half: a republished form migrates a draft
 * lazily on resume, and answers whose field no longer exists move to
 * `data.__orphaned` rather than being deleted
 * ([0027](../../../docs/decisions/0027-lazy-draft-migration.md)).
 *
 * **Nothing showed that to the person.** They resumed a draft, some of their
 * answers were no longer on the form, and they submitted believing everything
 * they had typed was in it. The answers are not lost from storage — they are
 * lost from the submission, and nobody was told.
 *
 * The semantics follow `formancy-error-summary`, which solved the same shape of
 * problem: the container takes focus through `tabindex="-1"` and is deliberately
 * NOT `role="alert"`, because focusing it already makes a screen reader announce
 * it and doing both announces it twice.
 */
export interface ResumeMigration {
  readonly severity: 'lossy' | 'breaking'
  readonly changes: ReadonlyArray<{ readonly kind: string; readonly path?: string }>
}

@Component({
  selector: 'formancy-resume-notice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (migration() !== undefined) {
      <div
        role="region"
        aria-label="This form changed while you were away"
        data-formancy-part="resume-notice"
        [attr.data-state]="migration()!.severity"
        tabindex="-1"
        #region
      >
        <h2 data-formancy-part="resume-notice-heading">This form changed while you were away</h2>

        @if (migration()!.severity === 'breaking') {
          <p>
            It changed too much for your answers to be moved across, so this is being shown as you
            left it and <strong>cannot be submitted</strong>. Starting again will give you the
            current form.
          </p>
        } @else {
          <p>{{ summary() }}</p>
          @if (setAside().length > 0) {
            <ul data-formancy-part="resume-notice-list">
              @for (path of setAside(); track path) {
                <li>{{ labelFor(path) }}</li>
              }
            </ul>
          }
        }
      </div>
    }
  `,
})
export class FormancyResumeNotice {
  /** Omitted when the draft came back unchanged. */
  readonly migration = input<ResumeMigration | undefined>(undefined)
  /** Question wording for a field key, since a key is not what the form asked. */
  readonly labels = input<Readonly<Record<string, string>>>({})

  protected readonly setAside = computed(() =>
    (this.migration()?.changes ?? [])
      .map((change) => change.path)
      .filter((path): path is string => path !== undefined),
  )

  protected readonly summary = computed(() => {
    const count = this.setAside().length
    return count === 1
      ? 'One question is no longer on this form. Your answer to it is still kept with the rest and will be sent with them — it is just not shown here any more.'
      : `${String(count)} questions are no longer on this form. Your answers to them are still kept with the rest and will be sent with them — they are just not shown here any more.`
  })

  private readonly region = viewChild<ElementRef<HTMLDivElement>>('region')

  private readonly focused = afterRenderEffect(() => {
    if (this.migration() === undefined) return
    this.region()?.nativeElement.focus()
  })

  protected labelFor(path: string): string {
    return this.labels()[path] ?? path
  }
}
