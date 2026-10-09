import {
  ChangeDetectionStrategy,
  Component,
  Injector,
  afterNextRender,
  computed,
  inject,
} from '@angular/core'
import { FieldComponentBase } from './field-shell.js'

/**
 * Options put in order ([0138](../../../../docs/decisions/0138-a-ranking-stores-the-order-chosen.md)).
 *
 * The control the React renderer emits, part for part and role for role: buttons and no
 * dragging, because a drag must have an equivalent that is not one (WCAG 2.2 SC 2.5.7) and
 * once the buttons exist they are the control. The order so far, each option with buttons
 * to move it up, move it down and take it out; and the options not ranked yet, each a
 * button that puts it at the end. Every button is named after the option it acts on.
 *
 * **It starts with nothing ranked**, because the options' written order is the author's.
 * **Focus follows the option**: after a move it is on the same button in the option's new
 * place, after ranking one it moves to the next still to rank.
 */
@Component({
  selector: 'formancy-ranking-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset
      [id]="control().id"
      data-formancy-part="field"
      [attr.data-formancy-field-path]="context.path"
      [attr.data-state]="showError() ? 'invalid' : 'valid'"
      [attr.aria-describedby]="control()['aria-describedby']"
      [disabled]="field.snapshot().disabled"
    >
      <legend data-formancy-part="label">{{ context.label }}</legend>
      @if (field.snapshot().required) {
        <!-- As the checkbox group carries it: role=group does not support
             aria-required, so the engine describes the group by this instead. -->
        <span data-formancy-part="required-hint" [id]="field.snapshot().ids.hint">required</span>
      }
      @if (ranked().length > 0) {
        <ol data-formancy-part="ranking-order" [attr.aria-label]="context.label + ': your order'">
          @for (option of ranked(); track option.value; let first = $first; let last = $last) {
            <li data-formancy-part="ranking-item">
              <span data-formancy-part="ranking-label">{{ option.label }}</span>
              <button
                type="button"
                [id]="buttonId('up', option.value)"
                data-formancy-part="ranking-up"
                [attr.aria-label]="'Move ' + option.label + ' up'"
                [attr.aria-disabled]="first ? true : null"
                (click)="move(option.value, -1)"
                (blur)="field.touch()"
              >
                &uarr;
              </button>
              <button
                type="button"
                [id]="buttonId('down', option.value)"
                data-formancy-part="ranking-down"
                [attr.aria-label]="'Move ' + option.label + ' down'"
                [attr.aria-disabled]="last ? true : null"
                (click)="move(option.value, 1)"
                (blur)="field.touch()"
              >
                &darr;
              </button>
              <button
                type="button"
                [id]="buttonId('remove', option.value)"
                data-formancy-part="ranking-remove"
                [attr.aria-label]="'Take ' + option.label + ' out of the order'"
                (click)="takeOut(option.value)"
                (blur)="field.touch()"
              >
                &times;
              </button>
            </li>
          }
        </ol>
      }
      @if (unranked().length > 0) {
        <ul
          data-formancy-part="ranking-pool"
          [attr.aria-label]="context.label + ': not ranked yet'"
        >
          @for (option of unranked(); track option.value) {
            <li data-formancy-part="ranking-candidate">
              <button
                type="button"
                [id]="buttonId('rank', option.value)"
                data-formancy-part="ranking-add"
                [attr.aria-label]="'Rank ' + option.label"
                (click)="rank(option.value)"
                (blur)="field.touch()"
              >
                {{ option.label }}
              </button>
            </li>
          }
        </ul>
      }
      @if (showError()) {
        <p data-formancy-part="error" [id]="field.snapshot().props.error.id">{{ errorText() }}</p>
      }
    </fieldset>
  `,
})
export class FormancyRankingField extends FieldComponentBase {
  private readonly injector = inject(Injector)

  protected readonly showError = computed(() => {
    const snapshot = this.field.snapshot()
    return snapshot.touched && snapshot.errors.length > 0
  })

  protected readonly errorText = computed(() => this.field.snapshot().errors.join(', '))

  /** The values in the order chosen, as stored. */
  private readonly order = computed<readonly string[]>(() => {
    const value = this.field.snapshot().value
    return Array.isArray(value) ? value.map(String) : []
  })

  /** Only what is offered, in the order chosen: a stored value no option has is the engine's to refuse. */
  protected readonly ranked = computed(() =>
    this.order()
      .map((value) => this.options().find((option) => option.value === value))
      .filter((option) => option !== undefined),
  )

  protected readonly unranked = computed(() =>
    this.options().filter((option) => !this.order().includes(option.value)),
  )

  protected buttonId(action: 'up' | 'down' | 'remove' | 'rank', value: string): string {
    return `${this.control().id}:${action}:${value}`
  }

  protected move(value: string, by: -1 | 1): void {
    const order = [...this.order()]
    const from = order.indexOf(value)
    const to = from + by
    if (from === -1 || to < 0 || to >= order.length) return
    order[from] = order[to]!
    order[to] = value
    this.reorder(order, this.buttonId(by === -1 ? 'up' : 'down', value))
  }

  protected rank(value: string): void {
    const unranked = this.unranked()
    const position = unranked.findIndex((option) => option.value === value)
    const following = unranked[position + 1] ?? unranked[position - 1]
    this.reorder(
      [...this.order(), value],
      following === undefined ? this.buttonId('up', value) : this.buttonId('rank', following.value),
    )
  }

  protected takeOut(value: string): void {
    this.reorder(
      this.order().filter((candidate) => candidate !== value),
      this.buttonId('rank', value),
    )
  }

  /**
   * Store the new order, then focus `focus` once it is drawn. After the next render rather
   * than now: the button moves, and a focused element that is moved loses focus.
   */
  private reorder(next: readonly string[], focus: string): void {
    this.field.setValue([...next])
    afterNextRender(() => document.getElementById(focus)?.focus(), { injector: this.injector })
  }
}
