import { NgComponentOutlet } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed } from '@angular/core'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatInputModule } from '@angular/material/input'
import { MaterialFieldBase } from './base.js'

/**
 * The answers typed into a box, drawn in Material's form field: text, a paragraph, a
 * number, a date and a time.
 *
 * One file for the five because they change together: each is `<mat-form-field>` around
 * one `matInput`, and what Material's form field asks of its control is the same for all
 * of them. The value handling is the default controls', kept line for line — this file
 * changes how a field looks, never what it stores.
 *
 * **Material's asterisk stays.** It is drawn by CSS on an empty `aria-hidden` element, so the
 * label's text and the control's accessible name are the field's name alone — the name
 * every renderer gives, and the one the conformance suite finds the control by — while a
 * sighted reader sees the marker Material's users expect. Measured on Material 22, after a
 * first draft hid it on the assumption that the star was text.
 */
@Component({
  selector: 'formancy-material-text-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatFormFieldModule, MatInputModule, NgComponentOutlet],
  template: `
    @if (plain()) {
      <mat-form-field [attr.data-formancy-field-path]="context.path">
        <mat-label>{{ context.label }}</mat-label>
        <input
          matInput
          type="text"
          [id]="control().id"
          [attr.name]="control().name"
          [required]="field.snapshot().required"
          [disabled]="field.snapshot().disabled"
          [errorStateMatcher]="matcher"
          [aria-describedby]="describedBy() ?? ''"
          [value]="text()"
          (input)="onInput($event)"
          (blur)="field.touch()"
        />
        <mat-error [id]="errorId()">{{ errorText() }}</mat-error>
      </mat-form-field>
    } @else {
      <ng-container *ngComponentOutlet="fallbackFor('text')" />
    }
  `,
})
export class FormancyMaterialTextField extends MaterialFieldBase {
  /** A mask or a scanner is the default control's: Material has neither. */
  protected readonly plain = computed(() => {
    const def = this.field.snapshot().def
    return def.mask === undefined && def.widget === undefined
  })

  protected readonly text = computed(() => {
    const value = this.field.snapshot().value
    return typeof value === 'string' ? value : ''
  })

  protected onInput(event: Event): void {
    this.field.setValue((event.target as HTMLInputElement).value)
  }
}

@Component({
  selector: 'formancy-material-textarea-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatFormFieldModule, MatInputModule],
  template: `
    <mat-form-field [attr.data-formancy-field-path]="context.path">
      <mat-label>{{ context.label }}</mat-label>
      <textarea
        matInput
        [id]="control().id"
        [attr.name]="control().name"
        [required]="field.snapshot().required"
        [disabled]="field.snapshot().disabled"
        [errorStateMatcher]="matcher"
        [aria-describedby]="describedBy() ?? ''"
        [value]="text()"
        (input)="onInput($event)"
        (blur)="field.touch()"
      ></textarea>
      <mat-error [id]="errorId()">{{ errorText() }}</mat-error>
    </mat-form-field>
  `,
})
export class FormancyMaterialTextareaField extends MaterialFieldBase {
  protected readonly text = computed(() => {
    const value = this.field.snapshot().value
    return typeof value === 'string' ? value : ''
  })

  protected onInput(event: Event): void {
    this.field.setValue((event.target as HTMLTextAreaElement).value)
  }
}

@Component({
  selector: 'formancy-material-number-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatFormFieldModule, MatInputModule, NgComponentOutlet],
  template: `
    @if (plain()) {
      <mat-form-field [attr.data-formancy-field-path]="context.path">
        <mat-label>{{ context.label }}</mat-label>
        <input
          matInput
          type="number"
          [id]="control().id"
          [attr.name]="control().name"
          [required]="field.snapshot().required"
          [disabled]="field.snapshot().disabled"
          [errorStateMatcher]="matcher"
          [aria-describedby]="describedBy() ?? ''"
          [value]="text()"
          (input)="onInput($event)"
          (blur)="field.touch()"
        />
        <mat-error [id]="errorId()">{{ errorText() }}</mat-error>
      </mat-form-field>
    } @else {
      <ng-container *ngComponentOutlet="fallbackFor('number')" />
    }
  `,
})
export class FormancyMaterialNumberField extends MaterialFieldBase {
  /** A rating or a slider is the default control's. */
  protected readonly plain = computed(() => this.field.snapshot().def.widget === undefined)

  protected readonly text = computed(() => {
    const value = this.field.snapshot().value
    return typeof value === 'number' ? String(value) : ''
  })

  protected onInput(event: Event): void {
    const raw = (event.target as HTMLInputElement).value
    this.field.setValue(raw === '' ? null : Number(raw))
  }
}

/**
 * The platform's date input inside Material's field, not Material's datepicker: the
 * datepicker speaks `Date` objects through a `DateAdapter`, and a date answer is a
 * calendar day with no time zone — converting through a `Date` is how a day becomes the
 * day before in half the world.
 */
@Component({
  selector: 'formancy-material-date-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatFormFieldModule, MatInputModule],
  template: `
    <mat-form-field [attr.data-formancy-field-path]="context.path">
      <mat-label>{{ context.label }}</mat-label>
      <input
        matInput
        type="date"
        [id]="control().id"
        [attr.name]="control().name"
        [required]="field.snapshot().required"
        [disabled]="field.snapshot().disabled"
        [errorStateMatcher]="matcher"
        [aria-describedby]="describedBy() ?? ''"
        [value]="text()"
        (input)="onInput($event)"
        (blur)="field.touch()"
      />
      <mat-error [id]="errorId()">{{ errorText() }}</mat-error>
    </mat-form-field>
  `,
})
export class FormancyMaterialDateField extends MaterialFieldBase {
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
  selector: 'formancy-material-time-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatFormFieldModule, MatInputModule],
  template: `
    <mat-form-field [attr.data-formancy-field-path]="context.path">
      <mat-label>{{ context.label }}</mat-label>
      <input
        matInput
        type="time"
        [id]="control().id"
        [attr.name]="control().name"
        [attr.min]="earliest()"
        [attr.max]="latest()"
        [required]="field.snapshot().required"
        [disabled]="field.snapshot().disabled"
        [errorStateMatcher]="matcher"
        [aria-describedby]="describedBy() ?? ''"
        [value]="text()"
        (input)="onInput($event)"
        (blur)="field.touch()"
      />
      <mat-error [id]="errorId()">{{ errorText() }}</mat-error>
    </mat-form-field>
  `,
})
export class FormancyMaterialTimeField extends MaterialFieldBase {
  protected readonly text = computed(() => {
    const value = this.field.snapshot().value
    return typeof value === 'string' ? value : ''
  })

  /* Bounds handed to the browser as in the default control; the engine's check is the truth. */
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
