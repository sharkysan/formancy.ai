import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core'
import {
  OPERATORS,
  comparisonLabel,
  compileGroup,
  composeRule,
  conditionOf,
  draftIsComplete,
  emptyRow,
  kindWrites,
  nameOf,
  operatorLabel,
  rowTakesValue,
  ruleKindHint,
  ruleKindLabel,
  ruleKindsFor,
  ruleTargetFor,
} from '@formancy/builder-core'
import type { BuilderSession, ConditionRow, LogicRule, Operator } from './types.js'
import { BuilderTextPipe } from './text.pipe.js'
import { injectBuilderView } from './view.js'

/**
 * Authoring the rules that make a form behave.
 *
 * A condition is edited as a condition — "Country is Switzerland" — and compiled
 * to CEL. The CEL is the single source of truth for evaluation and the structured
 * form is stored beside it as `editor` metadata, never evaluated: if both were
 * evaluable, client and server could disagree about which one meant what, which
 * is the drift this project exists to prevent.
 *
 * The generated expression is shown rather than hidden. A form author does not
 * have to read it, and a developer should not have to guess it.
 *
 * **Which kinds exist, what each is called, what it is written with and what it
 * compiles to are all `@formancy/builder-core`'s.** Two copies of that table
 * drift the first time the format grows a kind — and it already had: `computed`
 * was in the format, honoured by both renderers, and in neither builder's table.
 */
@Component({
  selector: 'formancy-logic-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BuilderTextPipe],
  template: `
    <div data-formancy-part="logic-panel">
      <h3>{{ 'logic.heading' | builderText: text() }}</h3>

      @if (mine().length === 0) {
        <p data-formancy-part="logic-empty">{{ 'logic.empty' | builderText: text() }}</p>
      } @else {
        <ul data-formancy-part="logic-list">
          @for (entry of mine(); track entry.index) {
            <li data-formancy-part="logic-rule">
              <span data-formancy-part="logic-kind">{{ labelOf(entry.rule) }}</span>
              <!-- The expression, shown. A developer should not have to guess
                   what the condition compiled to. -->
              <code>{{ entry.rule.cel }}</code>
              <button
                type="button"
                [attr.aria-label]="
                  'logic.remove' | builderText: text() : { rule: labelOf(entry.rule), target: target() }
                "
                (click)="remove(entry.index)"
              >
                {{ 'list.remove' | builderText: text() }}
              </button>
            </li>
          }
        </ul>
      }

      @if (drafting()) {
        <div data-formancy-part="logic-draft">
          <label>
            {{ 'logic.what' | builderText: text() }}
            <select [value]="kind()" (change)="onKind($event)">
              @for (choice of applicable(); track choice.id) {
                <option [value]="choice.id" [selected]="choice.id === kind()">
                  {{ kindLabel(choice.id) }}
                </option>
              }
            </select>
          </label>

          @if (writes() === 'check') {
            <label>
              {{ 'logic.check' | builderText: text() }}
              <input
                type="text"
                [value]="check()"
                [attr.placeholder]="'logic.check.example' | builderText: text()"
                (input)="onCheck($event)"
              />
            </label>
            <p data-formancy-part="logic-hint">{{ hint() }}</p>
          }

          @if (writes() === 'expression') {
            <label>
              {{ 'logic.calculation' | builderText: text() }}
              <input
                type="text"
                [value]="expression()"
                [attr.placeholder]="'logic.calculation.example' | builderText: text()"
                (input)="onExpression($event)"
              />
            </label>
            <!-- CEL, and said so: a calculation produces a VALUE rather than a
                 condition, so the comparison editor is the wrong surface for one
                 and a box is the honest offer. -->
            <p data-formancy-part="logic-hint">{{ hint() }}</p>
          }

          @if (writes() === 'condition') {
            <!-- Only once there is something to join. A control that does nothing
                 is a control somebody has to work out is irrelevant. -->
            @if (rows().length > 1) {
              <label>
                {{ 'logic.match' | builderText: text() }}
                <select [value]="join()" (change)="onJoin($event)">
                  <option value="all" [selected]="join() === 'all'">
                    {{ 'logic.join.all' | builderText: text() }}
                  </option>
                  <option value="any" [selected]="join() === 'any'">
                    {{ 'logic.join.any' | builderText: text() }}
                  </option>
                </select>
              </label>
            }

            @for (row of rows(); track $index; let at = $index) {
              <div data-formancy-part="logic-comparison">
                <label>
                  {{ labelFor('field', at) }}
                  <select [value]="row.field" (change)="onField(at, $event)">
                    @for (candidate of fields(); track candidate.path) {
                      <option [value]="candidate.path" [selected]="candidate.path === row.field">
                        {{ candidate.label }}
                      </option>
                    }
                  </select>
                </label>

                <label>
                  {{ labelFor('comparison', at) }}
                  <select [value]="row.operator" (change)="onOperator(at, $event)">
                    @for (candidate of operators; track candidate.id) {
                      <option [value]="candidate.id" [selected]="candidate.id === row.operator">
                        {{ operatorText(candidate.id) }}
                      </option>
                    }
                  </select>
                </label>

                @if (takesValue(row)) {
                  <label>
                    {{ labelFor('value', at) }}
                    <input type="text" [value]="row.text" (input)="onValue(at, $event)" />
                  </label>
                }

                <!-- The first one has no remove button: compileGroup refuses an
                     empty group rather than compiling to an expression that
                     always passes, so the UI must not be able to ask for one. -->
                @if (at > 0) {
                  <button type="button" (click)="removeRow(at)">
                    {{ 'logic.removeComparison' | builderText: text() : { number: at + 1 } }}
                  </button>
                }
              </div>
            }

            <button type="button" (click)="addRow()">
              {{ 'logic.addComparison' | builderText: text() }}
            </button>
            <p data-formancy-part="logic-hint">{{ hint() }}</p>
            <!-- Shown before it is added, not after. Somebody who can read CEL
                 can check the condition means what they chose. -->
            <code data-formancy-part="logic-preview">{{ preview() }}</code>
          }

          <div data-formancy-part="logic-actions">
            <button type="button" [disabled]="!complete()" (click)="add()">
              {{ 'logic.addRule' | builderText: text() }}
            </button>
            <button type="button" (click)="drafting.set(false)">
              {{ 'dialog.cancel' | builderText: text() }}
            </button>
          </div>
        </div>
      } @else {
        <button type="button" (click)="startDraft()">{{ 'logic.add' | builderText: text() }}</button>
      }
    </div>
  `,
})
export class FormancyLogicPanel {
  readonly session = input.required<BuilderSession>()
  /** The field or page the rules are about. */
  readonly keyPath = input.required<readonly string[]>()

  protected readonly operators = OPERATORS
  protected readonly view = injectBuilderView(this.session)
  /** Every word this panel shows, in the language the session was opened in (0114). */
  protected readonly text = computed(() => this.session().text)

  protected readonly drafting = signal(false)
  protected readonly kind = signal<LogicRule['kind']>('visible')
  protected readonly check = signal('')
  protected readonly expression = signal('')
  protected readonly join = signal<'all' | 'any'>('all')
  protected readonly rows = signal<readonly ConditionRow[]>([])

  /** What a rule here is addressed by, and which kinds apply. Decided by the core. */
  private readonly addressed = computed(() => ruleTargetFor(this.view().document, this.keyPath()))
  protected readonly target = computed(() => this.addressed().target)
  protected readonly applicable = computed(() => ruleKindsFor(this.addressed().on))
  protected readonly writes = computed(() => kindWrites(this.kind()))
  protected readonly hint = computed(() => ruleKindHint(this.kind(), this.text()))
  protected readonly fields = computed(() =>
    this.view()
      .nodes.filter((node) => !node.isContainer)
      .map((node) => ({
        path: node.keyPath.join('.'),
        label: nameOf(this.view().document, node.def),
      })),
  )
  protected readonly mine = computed(() => {
    const target = this.target()
    return (this.view().document.logic?.rules ?? [])
      .map((rule, index) => ({ rule, index }))
      .filter((entry) => entry.rule.target === target)
  })
  protected readonly preview = computed(() =>
    compileGroup({ join: this.join(), conditions: this.rows().map(conditionOf) }),
  )
  protected readonly complete = computed(() =>
    draftIsComplete({
      kind: this.kind(),
      rows: this.rows(),
      check: this.check(),
      expression: this.expression(),
    }),
  )

  protected labelOf(rule: LogicRule): string {
    return ruleKindLabel(rule.kind, this.text())
  }

  protected kindLabel(kind: LogicRule['kind']): string {
    return ruleKindLabel(kind, this.text())
  }

  protected operatorText(id: Operator): string {
    return operatorLabel(id, this.text())
  }

  /** Numbered from 1, and only when there is more than one — builder-core decides,
   *  for this panel and the React one. */
  protected labelFor(part: 'field' | 'comparison' | 'value', at: number): string {
    return comparisonLabel(part, at, this.rows().length, this.text())
  }

  protected takesValue(row: ConditionRow): boolean {
    return rowTakesValue(row)
  }

  protected startDraft(): void {
    this.kind.set(this.applicable()[0]?.id ?? 'visible')
    this.check.set('')
    this.expression.set('')
    this.join.set('all')
    this.rows.set([emptyRow(this.fields()[0]?.path ?? '')])
    this.drafting.set(true)
  }

  protected onKind(event: Event): void {
    this.kind.set((event.target as HTMLSelectElement).value as LogicRule['kind'])
  }

  protected onCheck(event: Event): void {
    this.check.set((event.target as HTMLInputElement).value)
  }

  protected onExpression(event: Event): void {
    this.expression.set((event.target as HTMLInputElement).value)
  }

  protected onJoin(event: Event): void {
    this.join.set((event.target as HTMLSelectElement).value as 'all' | 'any')
  }

  protected onField(at: number, event: Event): void {
    this.update(at, { field: (event.target as HTMLSelectElement).value })
  }

  protected onOperator(at: number, event: Event): void {
    this.update(at, { operator: (event.target as HTMLSelectElement).value as Operator })
  }

  protected onValue(at: number, event: Event): void {
    this.update(at, { text: (event.target as HTMLInputElement).value })
  }

  protected addRow(): void {
    this.rows.update((before) => [...before, emptyRow(this.fields()[0]?.path ?? '')])
  }

  protected removeRow(at: number): void {
    this.rows.update((before) => before.filter((_, index) => index !== at))
  }

  protected add(): void {
    this.drafting.set(false)
    this.session().addRule(
      composeRule({
        kind: this.kind(),
        target: this.target(),
        rows: this.rows(),
        join: this.join(),
        check: this.check().trim(),
        expression: this.expression().trim(),
      }),
    )
  }

  protected remove(index: number): void {
    this.session().removeRule(index)
  }

  private update(at: number, change: Partial<ConditionRow>): void {
    this.rows.update((before) =>
      before.map((row, index) => (index === at ? { ...row, ...change } : row)),
    )
  }
}
