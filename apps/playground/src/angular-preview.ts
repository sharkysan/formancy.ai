import { ChangeDetectionStrategy, Component, viewChild } from '@angular/core'
import type { TemplateRef } from '@angular/core'
import { FormancyForm } from '@formancy/angular'
import type { FieldBinding, FormancyFieldAddition, FormancyFieldAdditionContext, FormancyFieldBeside, FormancyFieldBesideContext } from '@formancy/angular'
import { PICKUP_POINTS } from './demo-capabilities.js'
import { CLEAR_GLYPH, OPEN_GLYPH } from './demo-glyphs.js'

/**
 * The Angular renderer, mounted beside the React one.
 *
 * This is the project's central claim made visible rather than asserted: *one*
 * engine build, two framework-native renderers, and the same document on screen
 * twice with nothing between them but a binding. Until now that claim lived
 * entirely in jsdom — `@formancy/angular` and `@formancy/builder-angular` were
 * complete, published, and mounted by no application, so parity was a test
 * result and the v0.1 goal of showing both in one screenshot was not met.
 *
 * Deliberately thin. Everything about how a field looks, what ARIA it carries
 * and when it appears comes from the engine and the package; what is here is a
 * host.
 *
 * **This file holds the component and nothing else**, and the bootstrap lives
 * next door in `angular-bootstrap.ts`. Not tidiness: Vite's Angular plugin
 * compiles whatever it is pointed at, and the compiler's output for a module
 * keeps the component and **drops a plain function exported beside it**. With
 * both in one file the build failed on `MISSING_EXPORT` for the bootstrap, which
 * is a confusing way to find out that a file is either Angular or not.
 */
@Component({
  selector: 'formancy-playground-angular',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormancyForm],
  // The same layout name the React side renders, so the two are comparable. A
  // different one would make every difference on screen a difference of
  // arrangement rather than of renderer.
  //
  // Under the pickup point, the point the answer holds, as the React pane draws it
  // (`demo-addition.tsx`, 0233): the template is handed the field's binding, which is how a host
  // reads the field there. Beside the pickup point an Open and beside the country a Clear, as the
  // React pane draws them (`demo-beside.tsx`, 0237), each unavailable while its field is empty.
  template: `
    <formancy-form layout="web" [review]="true" [fieldAddition]="addition" [fieldBeside]="beside" />
    <ng-template #chosenPoint let-field="field">
      @if (pointOf(field.snapshot().value); as point) {
        <span class="chosen-point" tabindex="-1">{{ point.label }} · <code>{{ point.value }}</code></span>
      }
    </ng-template>
    <ng-template #openPoint let-field="field">
      @let point = pointOf(field.snapshot().value);
      @let name = point === undefined ? 'Open the pickup point' : 'Open ' + point.label;
      <button type="button" [attr.aria-label]="name" [title]="name" [attr.aria-disabled]="point === undefined ? 'true' : null" (click)="open($event, point)">
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path [attr.d]="openGlyph" /></svg>
      </button>
    </ng-template>
    <ng-template #clearCountry let-field="field">
      <button
        type="button"
        aria-label="Clear the country"
        title="Clear the country"
        [attr.aria-disabled]="empty(field.snapshot().value) ? 'true' : null"
        (click)="clear(field)"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path [attr.d]="clearGlyph" /></svg>
      </button>
    </ng-template>
  `,
})
export class AngularPreview {
  private readonly chosenPoint = viewChild<TemplateRef<FormancyFieldAdditionContext>>('chosenPoint')
  private readonly openPoint = viewChild<TemplateRef<FormancyFieldBesideContext>>('openPoint')
  private readonly clearCountry = viewChild<TemplateRef<FormancyFieldBesideContext>>('clearCountry')

  protected readonly openGlyph = OPEN_GLYPH
  protected readonly clearGlyph = CLEAR_GLYPH

  /** Under the pickup point, and under nothing else. */
  protected readonly addition: FormancyFieldAddition = (path) => (path === 'deliveryPoint' ? this.chosenPoint() : undefined)

  /** Beside the pickup point and the country, and beside nothing else. */
  protected readonly beside: FormancyFieldBeside = (path) =>
    path === 'deliveryPoint' ? this.openPoint() : path === 'country' ? this.clearCountry() : undefined

  protected pointOf(value: unknown): { label: string; value: string } | undefined {
    return PICKUP_POINTS.find((point) => point.value === value)
  }

  protected empty(value: unknown): boolean {
    return value === null || value === undefined || value === ''
  }

  /** The keyboard to the point drawn under the field, as the React pane's Open moves it; nothing while no point is chosen. */
  protected open(event: Event, point: unknown): void {
    if (point === undefined || !(event.currentTarget instanceof HTMLElement)) return
    event.currentTarget.closest('[data-formancy-part="field"]')?.querySelector<HTMLElement>('.chosen-point')?.focus()
  }

  /** The answer taken away, as the select's empty option does; nothing while there is none. */
  protected clear(field: FieldBinding): void {
    if (!this.empty(field.snapshot().value)) field.setValue(null)
  }
}
