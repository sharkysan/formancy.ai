import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core'
import {
  addGroup,
  addRow,
  compileGroup,
  composeRule,
  conditionFields,
  draftIsComplete,
  emptyDraft,
  groupOf,
  isRowGroup,
  kindWrites,
  removeFromDraft,
  rowsOf,
  ruleKindHint,
  ruleKindLabel,
  ruleKindsFor,
  ruleTargetFor,
  setJoin,
  updateRow,
} from '@formancy/builder-core'
import type { ConditionDraft, ConditionRow, DraftPlace, RowGroup } from '@formancy/builder-core'
import type { BuilderSession, LogicRule } from './types.js'
import { FormancyLogicComparison } from './logic-comparison.js'
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
 * compiles to are all `@formancy/builder-core`'s** — and so, now, is the condition
 * being written: every edit to it is the core's, so this panel and the React one
 * cannot answer differently (0127).
 */
@Component({
  selector: 'formancy-logic-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BuilderTextPipe, FormancyLogicComparison],
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
            @if (draft().items.length > 1) {
              <label>
                {{ 'logic.match' | builderText: text() }}
                <select (change)="onJoin($event)">
                  <option value="all" [selected]="draft().join === 'all'">
                    {{ 'logic.join.all' | builderText: text() }}
                  </option>
                  <option value="any" [selected]="draft().join === 'any'">
                    {{ 'logic.join.any' | builderText: text() }}
                  </option>
                </select>
              </label>
            }

            @for (item of draft().items; track $index; let at = $index) {
              @if (asGroup(item); as group) {
                <fieldset data-formancy-part="logic-group">
                  <legend>{{ 'logic.group' | builderText: text() : { number: groupNumber(at) } }}</legend>
                  @if (group.rows.length > 1) {
                    <label>
                      {{ 'logic.group.match' | builderText: text() : { number: groupNumber(at) } }}
                      <select (change)="onJoin($event, at)">
                        <option value="all" [selected]="group.join === 'all'">
                          {{ 'logic.join.all' | builderText: text() }}
                        </option>
                        <option value="any" [selected]="group.join === 'any'">
                          {{ 'logic.join.any' | builderText: text() }}
                        </option>
                      </select>
                    </label>
                  }
                  @for (row of group.rows; track $index; let inner = $index) {
                    <formancy-logic-comparison
                      [row]="row"
                      [fields]="fields()"
                      [text]="text()"
                      [number]="numberOf(row)"
                      [count]="count()"
                      [removeLabel]="inner > 0 ? removeLabel(row) : undefined"
                      (changed)="change({ at: inner, group: at }, $event)"
                      (removed)="take({ at: inner, group: at })"
                    />
                  }
                  <button type="button" (click)="addTo(at)">
                    {{ 'logic.group.add' | builderText: text() : { number: groupNumber(at) } }}
                  </button>
                  <button type="button" (click)="take({ at })">
                    {{ 'logic.group.remove' | builderText: text() : { number: groupNumber(at) } }}
                  </button>
                </fieldset>
              } @else {
                <!-- The first one has no remove button: compileGroup refuses an
                     empty group rather than compiling to an expression that
                     always passes, so the UI must not be able to ask for one. -->
                <formancy-logic-comparison
                  [row]="asRow(item)"
                  [fields]="fields()"
                  [text]="text()"
                  [number]="numberOf(asRow(item))"
                  [count]="count()"
                  [removeLabel]="at > 0 ? removeLabel(asRow(item)) : undefined"
                  (changed)="change({ at }, $event)"
                  (removed)="take({ at })"
                />
              }
            }

            <button type="button" (click)="addTo()">
              {{ 'logic.addComparison' | builderText: text() }}
            </button>
            <button type="button" (click)="addAGroup()">
              {{ 'logic.addGroup' | builderText: text() }}
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

  protected readonly view = injectBuilderView(this.session)
  /** Every word this panel shows, in the language the session was opened in (0114). */
  protected readonly text = computed(() => this.session().text)

  protected readonly drafting = signal(false)
  protected readonly kind = signal<LogicRule['kind']>('visible')
  protected readonly check = signal('')
  protected readonly expression = signal('')
  protected readonly draft = signal<ConditionDraft>({ join: 'all', items: [] })

  /** What a rule here is addressed by, and which kinds apply. Decided by the core. */
  private readonly addressed = computed(() => ruleTargetFor(this.view().document, this.keyPath()))
  protected readonly target = computed(() => this.addressed().target)
  protected readonly applicable = computed(() => ruleKindsFor(this.addressed().on))
  protected readonly writes = computed(() => kindWrites(this.kind()))
  protected readonly hint = computed(() => ruleKindHint(this.kind(), this.text()))
  /** At the paths the engine reads, from the core: the tree's key path named a field
   *  inside a page by a path no field has (0127). */
  protected readonly fields = computed(() => conditionFields(this.view().document))
  private readonly rows = computed(() => rowsOf(this.draft()))
  protected readonly count = computed(() => this.rows().length)
  protected readonly mine = computed(() => {
    const target = this.target()
    return (this.view().document.logic?.rules ?? [])
      .map((rule, index) => ({ rule, index }))
      .filter((entry) => entry.rule.target === target)
  })
  protected readonly preview = computed(() => {
    const draft = this.draft()
    return draft.items.length === 0 ? '' : compileGroup(groupOf(draft, this.fields()))
  })
  protected readonly complete = computed(() =>
    draftIsComplete({
      kind: this.kind(),
      draft: this.draft(),
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

  protected asGroup(item: ConditionRow | RowGroup): RowGroup | null {
    return isRowGroup(item) ? item : null
  }

  protected asRow(item: ConditionRow | RowGroup): ConditionRow {
    return item as ConditionRow
  }

  /** Groups numbered in order among themselves: "Group 1", "Group 2". */
  protected groupNumber(at: number): number {
    return this.draft().items.slice(0, at + 1).filter(isRowGroup).length
  }

  /** Numbered across the whole condition, so every comparison's controls have a name
   *  of their own even when two sit in different groups. */
  protected numberOf(row: ConditionRow): number {
    return this.rows().indexOf(row)
  }

  protected removeLabel(row: ConditionRow): string {
    return this.text()('logic.removeComparison', { number: this.numberOf(row) + 1 })
  }

  protected startDraft(): void {
    this.kind.set(this.applicable()[0]?.id ?? 'visible')
    this.check.set('')
    this.expression.set('')
    this.draft.set(emptyDraft(this.fields()))
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

  protected onJoin(event: Event, group?: number): void {
    const join = (event.target as HTMLSelectElement).value as 'all' | 'any'
    this.draft.update((before) => setJoin(before, join, group))
  }

  protected change(place: DraftPlace, change: Partial<ConditionRow>): void {
    this.draft.update((before) => updateRow(before, place, change, this.fields()))
  }

  protected take(place: DraftPlace): void {
    this.draft.update((before) => removeFromDraft(before, place))
  }

  protected addTo(group?: number): void {
    this.draft.update((before) => addRow(before, this.fields(), group))
  }

  protected addAGroup(): void {
    this.draft.update((before) => addGroup(before, this.fields()))
  }

  protected add(): void {
    this.drafting.set(false)
    this.session().addRule(
      composeRule({
        kind: this.kind(),
        target: this.target(),
        draft: this.draft(),
        fields: this.fields(),
        check: this.check().trim(),
        expression: this.expression().trim(),
      }),
    )
  }

  protected remove(index: number): void {
    this.session().removeRule(index)
  }
}
