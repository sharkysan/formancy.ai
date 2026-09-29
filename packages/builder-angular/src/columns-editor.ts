import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core'
import type { DataGridColumn, FieldDef } from './types.js'

let nextId = 0

/**
 * The editor for a datagrid's columns.
 *
 * Everything else in the property panel is generated from the JSON Schema, and
 * for the same reason as `options` this one cannot be: the schema says "array of
 * objects", and the honest generic rendering of that is a textarea full of JSON.
 *
 * **A column NAMES a child field; it does not create one.** So the answer is a
 * choice from the children the repeater already has, never a text box — a typed
 * name is a column over nothing, which `validateSchema` refuses at publish rather
 * than at the keystroke.
 *
 * **And a column list is an ORDERING, not a choice of which answers to keep**
 * ([0066](../../../docs/decisions/0066-a-widget-may-be-configured.md)). A child
 * no column names is still collected and still gets a column, appended after the
 * configured ones. The panel says so out loud, because an author who removes a
 * column expects the answer to disappear with it.
 */
@Component({
  selector: 'formancy-columns-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div data-formancy-part="columns-editor">
      <div [attr.id]="headingId" data-formancy-part="columns-heading">Columns</div>

      @if (draft().length === 0) {
        <p data-formancy-part="columns-empty">
          No columns configured. Every answer still gets one, in the order the fields are
          declared.
        </p>
      } @else {
        <ul [attr.aria-labelledby]="headingId" data-formancy-part="columns-list">
          <!-- Keyed by position: a column has no identity of its own, and keying
               by the field it names would rebuild the row when somebody changes
               that choice. -->
          @for (column of draft(); track $index; let at = $index) {
            <li data-formancy-part="column-row">
              <!-- A choice and never a text box: a column names a child that
                   exists, and a typed name is a column over nothing. -->
              <label [attr.for]="fieldId(at)">Answer</label>
              <select [attr.id]="fieldId(at)" (change)="setField(at, $event)">
                <!-- The one it names, even if that child is gone — so the panel
                     shows what the document says rather than silently rewriting
                     it. -->
                @if (!names(column.field)) {
                  <option [value]="column.field" selected>{{ column.field }} — no such field</option>
                }
                @for (child of children(); track child.key) {
                  <option [value]="child.key" [selected]="child.key === column.field">
                    {{ child.key }}
                  </option>
                }
              </select>

              <!-- A ratio, never a length: a length in a document is the format
                   choosing the consumer's design system for them, and no renderer
                   can honour one on a narrow screen. -->
              <label [attr.for]="widthId(at)">Width, as a share</label>
              <input
                [attr.id]="widthId(at)"
                type="number"
                min="0"
                step="0.5"
                [value]="column.width ?? ''"
                (input)="setWidth(at, $event)"
              />

              <label [attr.for]="alignId(at)">Align</label>
              <select [attr.id]="alignId(at)" (change)="setAlign(at, $event)">
                <option value="" [selected]="column.align === undefined">Default</option>
                <option value="start" [selected]="column.align === 'start'">Start</option>
                <option value="center" [selected]="column.align === 'center'">Center</option>
                <option value="end" [selected]="column.align === 'end'">End</option>
              </select>

              <!-- Shortens the HEADING and never the question: the field's own
                   label is still what a screen reader announces for every answer
                   in the column. -->
              <label [attr.for]="headerId(at)">Short heading</label>
              <input
                [attr.id]="headerId(at)"
                type="text"
                [value]="headerText(column)"
                (input)="setHeader(at, $event)"
              />

              <!-- Named, not an unlabelled cross: four identical remove buttons
                   are four identical announcements. -->
              <button
                type="button"
                [attr.aria-label]="'Remove the ' + column.field + ' column'"
                (click)="remove(at)"
              >
                Remove
              </button>
            </li>
          }
        </ul>
      }

      @if (unnamed().length === 0) {
        <p data-formancy-part="columns-all-named">
          Every answer has a column. The ones above are sized and ordered; removing one puts
          its answer back at the end rather than taking it off the form.
        </p>
      } @else {
        <button type="button" (click)="configure()">
          {{ 'Configure the ' + unnamed()[0]!.key + ' column' }}
        </button>
      }
    </div>
  `,
})
export class FormancyColumnsEditor {
  readonly columns = input<readonly DataGridColumn[]>([])
  /** The repeater's own children, which are the only things a column may name. */
  readonly children = input<readonly FieldDef[]>([])
  readonly changed = output<DataGridColumn[]>()

  protected readonly headingId = `formancy-columns-${String((nextId += 1))}`

  private readonly local = signal<DataGridColumn[] | null>(null)
  /** What this editor last sent, so its own echo is not adopted as a change. */
  private pushed = ''

  /**
   * A local draft, for the reason the options editor keeps one: the document
   * refuses invalid states and a person editing passes through them. Clearing a
   * width to retype it is empty for a moment, the command is refused, and a box
   * bound straight to the document snaps back mid-keystroke.
   */
  protected readonly draft = computed((): DataGridColumn[] => {
    const incoming = JSON.stringify(this.columns())
    const held = this.local()
    if (held !== null && incoming === this.pushed) return held
    return [...this.columns()]
  })

  protected readonly unnamed = computed(() =>
    this.children().filter((child) => !this.draft().some((column) => column.field === child.key)),
  )

  protected fieldId(at: number): string {
    return `${this.headingId}-field-${String(at)}`
  }

  protected widthId(at: number): string {
    return `${this.headingId}-width-${String(at)}`
  }

  protected alignId(at: number): string {
    return `${this.headingId}-align-${String(at)}`
  }

  protected headerId(at: number): string {
    return `${this.headingId}-header-${String(at)}`
  }

  protected names(field: string): boolean {
    return this.children().some((child) => child.key === field)
  }

  protected headerText(column: DataGridColumn): string {
    return typeof column.header === 'string' ? column.header : ''
  }

  protected setField(at: number, event: Event): void {
    this.replace(at, { field: (event.target as HTMLSelectElement).value })
  }

  protected setWidth(at: number, event: Event): void {
    const raw = (event.target as HTMLInputElement).value
    this.replace(at, { width: raw === '' ? undefined : Number(raw) })
  }

  protected setAlign(at: number, event: Event): void {
    const raw = (event.target as HTMLSelectElement).value
    this.replace(at, { align: raw === '' ? undefined : (raw as DataGridColumn['align']) })
  }

  protected setHeader(at: number, event: Event): void {
    this.replace(at, { header: (event.target as HTMLInputElement).value })
  }

  protected remove(at: number): void {
    this.commit(this.draft().filter((_, index) => index !== at))
  }

  protected configure(): void {
    const next = this.unnamed()[0]
    if (next === undefined) return
    this.commit([...this.draft(), { field: next.key }])
  }

  /**
   * `undefined` is a real instruction here — "remove this property" — and
   * `exactOptionalPropertyTypes` will not let it through a plain `Partial`
   * without the type saying so.
   *
   * `field` is not in that set: a column always names something, and clearing it
   * would leave a column over nothing rather than a column with a default.
   */
  private replace(
    at: number,
    patch: {
      field?: string
      width?: number | undefined
      align?: DataGridColumn['align'] | undefined
      header?: DataGridColumn['header'] | undefined
    },
  ): void {
    this.commit(
      this.draft().map((column, index): DataGridColumn => {
        if (index !== at) return column
        // Built property by property rather than spread, because an ABSENT
        // property and an empty one are different things in the document:
        // `width` left out means "an even share", `width: 0` is refused outright
        // as a column nobody can see, and `header: ''` would be a heading of
        // nothing rather than no heading.
        //
        // For `width` the session would catch it anyway — it copies through JSON
        // and `undefined` does not survive that — so only `header` is genuinely
        // held here, where `''` IS a value JSON keeps. Measured, by writing the
        // spread and watching the width case stay green: a comment claiming this
        // editor prevents both would have been half true.
        const next = { ...column, ...patch }
        const merged: DataGridColumn = { field: next.field }
        if (next.width !== undefined) merged.width = next.width
        if (next.align !== undefined) merged.align = next.align
        if (next.header !== undefined && next.header !== '') merged.header = next.header
        return merged
      }),
    )
  }

  private commit(next: DataGridColumn[]): void {
    this.local.set(next)
    this.pushed = JSON.stringify(next)
    this.changed.emit(next)
  }
}
