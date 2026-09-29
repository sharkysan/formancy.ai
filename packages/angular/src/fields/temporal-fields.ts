import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core'
import { FieldComponentBase, FormancyFieldShell } from './field-shell.js'


/**
 * The temporal controls, each holding one canonical fixed-width string.
 *
 * One file per control, because a control changes for its own reasons.
 * These were one 1,909-line file — the second largest in the repository,
 * and the place things went.
 */
@Component({
  selector: 'formancy-date-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormancyFieldShell],
  template: `
    <formancy-field-shell [field]="field" [label]="context.label" [path]="context.path">
      <input
        type="date"
        [id]="control().id"
        [attr.name]="control().name"
        [attr.aria-invalid]="control()['aria-invalid']"
        [attr.aria-required]="control()['aria-required']"
        [attr.aria-describedby]="control()['aria-describedby']"
        [disabled]="control().disabled === true"
        [value]="text()"
        (input)="onInput($event)"
        (blur)="field.touch()"
      />
    </formancy-field-shell>
  `,
})
export class FormancyDateField extends FieldComponentBase {
  protected readonly text = computed(() => {
    const value = this.field.snapshot().value
    return typeof value === 'string' ? value : ''
  })

  protected onInput(event: Event): void {
    const raw = (event.target as HTMLInputElement).value
    this.field.setValue(raw === '' ? null : raw)
  }
}

@Component({
  selector: 'formancy-time-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormancyFieldShell],
  template: `
    <formancy-field-shell [field]="field" [label]="context.label" [path]="context.path">
      <input
        type="time"
        [id]="control().id"
        [attr.name]="control().name"
        [attr.aria-invalid]="control()['aria-invalid']"
        [attr.aria-required]="control()['aria-required']"
        [attr.aria-describedby]="control()['aria-describedby']"
        [attr.min]="earliest()"
        [attr.max]="latest()"
        [disabled]="control().disabled === true"
        [value]="text()"
        (input)="onInput($event)"
        (blur)="field.touch()"
      />
    </formancy-field-shell>
  `,
})
/**
 * A time of day, as `HH:MM`.
 *
 * `<input type="time">` gives the platform's picker, keyboard handling and locale
 * display — a 12-hour clock where the reader expects one — while its `value` is
 * always 24-hour `HH:MM`. Exactly the split the format wants: the reader sees their
 * convention, the answer records one canonical shape.
 *
 * No `step`, so the browser offers no seconds. A time answer has none, and a control
 * offering precision the format discards loses what somebody typed.
 */
export class FormancyTimeField extends FieldComponentBase {
  protected readonly text = computed(() => {
    const value = this.field.snapshot().value
    return typeof value === 'string' ? value : ''
  })

  /* Bounds handed to the browser as well as checked by the engine. The engine's
     check is the truth — it runs again on the server — and these let the platform
     grey out what it will not accept, which beats a message after the fact. */
  protected readonly earliest = computed(() => {
    const bound = this.field.snapshot().def.earliest
    return typeof bound === 'string' ? bound : null
  })

  protected readonly latest = computed(() => {
    const bound = this.field.snapshot().def.latest
    return typeof bound === 'string' ? bound : null
  })

  protected onInput(event: Event): void {
    const raw = (event.target as HTMLInputElement).value
    this.field.setValue(raw === '' ? null : raw)
  }
}

@Component({
  selector: 'formancy-datetime-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormancyFieldShell],
  template: `
    <formancy-field-shell [field]="field" [label]="context.label" [path]="context.path">
      <input
        type="datetime-local"
        [id]="control().id"
        [attr.name]="control().name"
        [attr.aria-invalid]="control()['aria-invalid']"
        [attr.aria-required]="control()['aria-required']"
        [attr.aria-describedby]="control()['aria-describedby']"
        [disabled]="control().disabled === true"
        [value]="localText()"
        (input)="onInput($event)"
        (blur)="field.touch()"
      />
    </formancy-field-shell>
  `,
})
/**
 * An instant, stored as `YYYY-MM-DDTHH:MM:SSZ`.
 *
 * `datetime-local` because no browser has a zoned datetime input, so the control
 * shows a local wall clock and this converts. The conversion is why this is not the
 * date field with another `type`:
 *
 * - **In:** the control gives `YYYY-MM-DDTHH:MM` in the reader's own zone, and `new
 *   Date(local)` reads a zoneless string as local time — which is what is wanted at
 *   the moment somebody types, and exactly what `bindTimestamp` refuses for a value
 *   already stored, because the zone is not knowable later.
 * - **Out:** the stored instant is rendered back into local parts for the control,
 *   never `toISOString()`, which would show UTC in a box the browser labels local.
 *
 * Seconds are therefore `00` in any answer a person typed. The format keeps them
 * because a machine-supplied answer has them, and one fixed width is what makes
 * ordering work.
 */
export class FormancyDateTimeField extends FieldComponentBase {
  protected readonly localText = computed(() => {
    const value = this.field.snapshot().value
    if (typeof value !== 'string' || value === '') return ''
    const instant = new Date(value)
    if (Number.isNaN(instant.getTime())) return ''
    const pad = (part: number): string => String(part).padStart(2, '0')
    return (
      `${String(instant.getFullYear())}-${pad(instant.getMonth() + 1)}-${pad(instant.getDate())}` +
      `T${pad(instant.getHours())}:${pad(instant.getMinutes())}`
    )
  })

  protected onInput(event: Event): void {
    const local = (event.target as HTMLInputElement).value
    if (local === '') {
      this.field.setValue(null)
      return
    }
    const instant = new Date(local)
    // A control can hand back something unparseable mid-edit. Null rather than a
    // malformed string keeps the stored answer always either empty or canonical,
    // which is what the engine's shape check assumes.
    this.field.setValue(
      Number.isNaN(instant.getTime()) ? null : `${instant.toISOString().slice(0, 19)}Z`,
    )
  }
}
