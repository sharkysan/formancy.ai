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
  template: `
    @if (errors().length > 0) {
      <div data-formancy-part="error-summary" tabindex="-1" #region>
        <h2 data-formancy-part="error-summary-heading">{{ heading() }}</h2>
        <ul>
          @for (entry of errors(); track entry.path) {
            <li><a [attr.href]="'#' + controlIdOf(entry.path)" (click)="focusControl($event, entry.path)">{{ labelFor(entry.path) }}: {{ entry.codes.join(', ') }}</a></li>
          }
        </ul>
      </div>
    }
  `,
})
export class FormancyErrorSummary {
  readonly labels = input<Record<string, string>>()

  private readonly engine = injectEngine()
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

  protected readonly heading = computed(() => {
    const count = this.errors().length
    return count === 1 ? 'There is 1 problem to fix' : `There are ${count} problems to fix`
  })

  protected labelFor(path: string): string {
    return this.labels()?.[path] ?? this.labels()?.[path.replace(/\[\d+\]/, '[]')] ?? path
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
