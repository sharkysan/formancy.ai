import { focusControl } from './focus-control.js'
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  afterRenderEffect,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core'
import type { ElementRef, Signal } from '@angular/core'
import { parsePath } from '@formancy/core'
import { injectEngine } from './provide.js'
import { FormancyTextPipe, injectFormText } from './text.js'

/**
 * The error summary a failed submit focuses.
 *
 * The semantics are deliberate and easy to get wrong: the container takes
 * focus via tabindex="-1" — focusing it already makes screen readers announce
 * it, so role="alert" would announce it TWICE. Each entry is a real in-page
 * link to the offending control, because links are what "take me to the
 * problem" already means to assistive tech.
 */
@Component({
  selector: 'formancy-error-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormancyTextPipe],
  template: `
    @if (errors().length > 0) {
      <div data-formancy-part="error-summary" tabindex="-1" #region>
        <h2 data-formancy-part="error-summary-heading">{{ heading() }}</h2>
        <ul>
          @for (entry of errors(); track entry.path) {
            <li><a [attr.href]="'#' + controlIdOf(entry.path)" (click)="focusControl($event, entry.path)">{{ 'errors.entry' | formancyText: { label: labelFor(entry.path), codes: entry.codes.join(', ') } }}</a></li>
          }
        </ul>
      </div>
    }
  `,
})
export class FormancyErrorSummary {
  readonly labels = input<Record<string, string>>()

  private readonly engine = injectEngine()
  private readonly text = injectFormText()
  private readonly region = viewChild<ElementRef<HTMLElement>>('region')

  protected readonly errors: Signal<ReadonlyArray<{ path: string; codes: readonly string[] }>>

  constructor() {
    const errors = signal(this.engine.visibleErrors())
    const unsubscribe = this.engine.subscribe(() => errors.set(this.engine.visibleErrors()))
    inject(DestroyRef).onDestroy(unsubscribe)
    this.errors = errors.asReadonly()

    // Focus when errors APPEAR (a submit surfaced them), not on every
    // keystroke that edits an already-broken field. afterRenderEffect, because
    // the container only exists in the DOM once the render that shows it ran.
    let previousCount = 0
    afterRenderEffect(() => {
      const count = this.errors().length
      if (count > 0 && previousCount === 0) this.region()?.nativeElement.focus()
      previousCount = count
    })
  }

  /** Counted by the form's language, never by `=== 1` (0171). */
  protected readonly heading = computed(() => this.text('errors.heading', { count: this.errors().length }))

  protected labelFor(path: string): string {
    // The host's words first, then the field's own label in the form's language, and the
    // path only for a field with neither — as the React summary names it.
    return (
      this.labels()?.[path] ??
      this.labels()?.[path.replace(/\[\d+\]/, '[]')] ??
      this.engine.getFieldSnapshot(parsePath(path)).label ??
      path
    )
  }

  protected controlIdOf(path: string): string {
    return this.engine.getFieldSnapshot(parsePath(path)).ids.control
  }

  protected focusControl(event: Event, path: string): void {
    // The hash alone scrolls but does not focus; do both.
    event.preventDefault()
    focusControl(document.getElementById(this.controlIdOf(path)))
  }
}
