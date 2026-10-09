import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core'
import {
  comparisonLabel,
  operatorLabel,
  operatorTakesValue,
  operatorsFor,
} from '@formancy/builder-core'
import type { BuilderText, ConditionField, ConditionRow, Operator } from '@formancy/builder-core'
import { BuilderTextPipe } from './text.pipe.js'

/** The box a value is typed into, by what the field holds. */
const INPUT_TYPE: Partial<Record<ConditionField['kind'], string>> = {
  number: 'number',
  date: 'date',
  time: 'time',
  datetime: 'datetime-local',
}

/**
 * One comparison: a field, what it is compared by, and a value of the field's own kind.
 *
 * The value control follows the field — a choice offers its options, a checkbox yes or
 * no, a number a number box, a date a date — and the comparisons offered are the ones
 * the field can take. Every edit is handed back to the panel, which hands it to
 * builder-core, so this and the React comparison cannot decide differently (0127).
 */
@Component({
  selector: 'formancy-logic-comparison',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BuilderTextPipe],
  template: `
    <div data-formancy-part="logic-comparison">
      <label>
        {{ label('field') }}
        <select (change)="changed.emit({ field: valueOf($event) })">
          @for (candidate of fields(); track candidate.path) {
            <option [value]="candidate.path" [selected]="candidate.path === row().field">
              {{ candidate.label }}
            </option>
          }
        </select>
      </label>

      <label>
        {{ label('comparison') }}
        <select (change)="changed.emit({ operator: operatorOf($event) })">
          @for (operator of operators(); track operator) {
            <option [value]="operator" [selected]="operator === row().operator">
              {{ operatorText(operator) }}
            </option>
          }
        </select>
      </label>

      @if (takesValue()) {
        <label>
          {{ label('value') }}
          @switch (control()) {
            @case ('choice') {
              <select (change)="changed.emit({ text: valueOf($event) })">
                <option value="" [selected]="row().text === ''">
                  {{ 'logic.value.choose' | builderText: text() }}
                </option>
                @for (option of field()?.options ?? []; track option.value) {
                  <option [value]="option.value" [selected]="option.value === row().text">
                    {{ option.label }}
                  </option>
                }
              </select>
            }
            @case ('boolean') {
              <select (change)="changed.emit({ text: valueOf($event) })">
                <option value="true" [selected]="row().text === 'true'">
                  {{ 'logic.value.yes' | builderText: text() }}
                </option>
                <option value="false" [selected]="row().text === 'false'">
                  {{ 'logic.value.no' | builderText: text() }}
                </option>
              </select>
            }
            @default {
              <input
                [type]="inputType()"
                [value]="row().text"
                (input)="changed.emit({ text: valueOf($event) })"
              />
            }
          }
        </label>
      }

      @if (removeLabel(); as name) {
        <button type="button" (click)="removed.emit()">{{ name }}</button>
      }
    </div>
  `,
})
export class FormancyLogicComparison {
  readonly row = input.required<ConditionRow>()
  readonly fields = input.required<readonly ConditionField[]>()
  readonly text = input.required<BuilderText>()
  /** Its place among every comparison in the condition, from 0, for its controls' names. */
  readonly number = input.required<number>()
  readonly count = input.required<number>()
  /** Present when it may be taken out; the condition's first comparison may not. */
  readonly removeLabel = input<string | undefined>(undefined)

  readonly changed = output<Partial<ConditionRow>>()
  readonly removed = output<void>()

  protected readonly field = computed(() =>
    this.fields().find((candidate) => candidate.path === this.row().field),
  )
  protected readonly operators = computed(() => operatorsFor(this.field()?.kind ?? 'other'))
  protected readonly takesValue = computed(() => operatorTakesValue(this.row().operator))
  protected readonly control = computed(() => {
    const kind = this.field()?.kind ?? 'other'
    return kind === 'choice' || kind === 'list' ? 'choice' : kind === 'boolean' ? 'boolean' : 'box'
  })
  protected readonly inputType = computed(() => INPUT_TYPE[this.field()?.kind ?? 'other'] ?? 'text')

  /** Numbered from 1, and only when there is more than one — builder-core decides. */
  protected label(part: 'field' | 'comparison' | 'value'): string {
    return comparisonLabel(part, this.number(), this.count(), this.text())
  }

  protected operatorText(operator: Operator): string {
    return operatorLabel(operator, this.text())
  }

  protected valueOf(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value
  }

  protected operatorOf(event: Event): Operator {
    return this.valueOf(event) as Operator
  }
}
