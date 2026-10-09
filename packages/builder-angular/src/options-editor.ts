import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core'
import { LIST_WORDS, createBuilderText, nextChoice, withPicture } from '@formancy/builder-core'
import type { BuilderText } from '@formancy/builder-core'
import type { FieldOption } from './types.js'
import { BuilderTextPipe } from './text.pipe.js'

const ENGLISH = createBuilderText()

let nextId = 0

/**
 * The editor for a `select` or `radio` field's choices.
 *
 * Everything else in the property panel is generated from the JSON Schema, and a
 * list of value/label pairs has no generic rendering that is any good: the schema
 * says "array of objects", and the honest generic answer is a textarea full of
 * JSON.
 *
 * **The two columns are not the same kind of thing, and the panel says so.**
 * `value` is what lands in the submission and is stable identity — changing it
 * orphans every answer already given, exactly as a field key does
 * ([0011](../../../docs/decisions/0011-declared-renames.md)). `label` is what a
 * person reads and is safe to reword.
 *
 * A local draft, because the document refuses invalid states and a person editing
 * text passes through them. Clearing a label to retype it makes it empty for a
 * moment and the schema requires a non-empty one, so the command is refused, the
 * document does not change, and a box bound straight to it snaps back mid-word —
 * measured in the React editor: typing "Schweiz" over "Switzerland" produced
 * "SwitzerlandSchweiz". So the boxes show the draft, every edit is offered to the
 * session, and a refusal leaves the document where it was. The form still cannot
 * be PUBLISHED in an invalid state; it can be typed in.
 *
 * **Laid out as the React editor is**, with its names and its parts. It was not:
 * each choice's text box was called "Label" — the panel's own Label for the field
 * is a second control with that name, ambiguous read aloud — it had no word for
 * an empty list, and its parts were named so that a theme styling the React
 * editor left this one bare.
 */
@Component({
  selector: 'formancy-options-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BuilderTextPipe],
  template: `
    <div data-formancy-part="options-editor">
      <h3 [attr.id]="headingId" data-formancy-part="options-heading">
        {{ words().heading | builderText: text() }}
      </h3>
      @if (draft().length === 0) {
        <p data-formancy-part="options-empty">{{ words().empty | builderText: text() }}</p>
      } @else {
        <ul [attr.aria-labelledby]="headingId" data-formancy-part="options-list">
          @for (option of draft(); track $index; let at = $index) {
            <li data-formancy-part="option-row">
              <!-- "Choice label", not "Label": the panel already has a Label for
                   the field itself, and two controls with one name are ambiguous
                   read aloud as well as in a test. -->
              <label [attr.for]="labelId(at)">{{ words().label | builderText: text() }}</label>
              <input
                [attr.id]="labelId(at)"
                [value]="labelText(option)"
                (input)="setLabel(at, $event)"
              />
              <label [attr.for]="valueId(at)">{{ 'options.value' | builderText: text() }}</label>
              <input
                [attr.id]="valueId(at)"
                [value]="option.value"
                (input)="setValue(at, $event)"
              />
              @if (pictures()) {
                <label [attr.for]="imageId(at)">{{ 'options.image' | builderText: text() }}</label>
                <input
                  type="url"
                  [attr.id]="imageId(at)"
                  [value]="option.image?.src ?? ''"
                  (input)="setPicture(at, 'src', $event)"
                />
                <!-- Nothing to describe until there is a picture; a description typed
                     first would have nowhere to go. -->
                <label [attr.for]="altId(at)">{{ 'options.imageAlt' | builderText: text() }}</label>
                <input
                  [attr.id]="altId(at)"
                  [disabled]="option.image === undefined"
                  [value]="altText(option)"
                  (input)="setPicture(at, 'alt', $event)"
                />
              }
              <button
                type="button"
                [attr.aria-label]="
                  'options.remove' | builderText: text() : { name: describe(option) }
                "
                (click)="remove(at)"
              >
                {{ 'list.remove' | builderText: text() }}
              </button>
            </li>
          }
        </ul>
      }
      <button type="button" (click)="add()">{{ words().add | builderText: text() }}</button>
    </div>
  `,
})
export class FormancyOptionsEditor {
  readonly options = input<readonly FieldOption[]>([])
  /** The language to speak: the panel passes its session's. English when none is given. */
  readonly text = input<BuilderText>(ENGLISH)
  readonly changed = output<FieldOption[]>()
  /**
   * Whether each choice may carry a picture — `EditableProperty.pictures`, which
   * builder-core decides from the field's type and widget (0126).
   */
  readonly pictures = input(false)
  /** A field's choices, or a matrix's rows: the same editor, its own words (0139). */
  readonly list = input<'options' | 'rows'>('options')
  protected readonly words = computed(() => LIST_WORDS[this.list()])

  protected readonly headingId = `formancy-options-${String((nextId += 1))}`

  private readonly local = signal<FieldOption[] | null>(null)
  /** What this editor last sent, so its own echo is not adopted as a change. */
  private pushed = ''

  protected readonly draft = computed((): FieldOption[] => {
    const incoming = JSON.stringify(this.options())
    const held = this.local()
    // Only adopt a change that came from somewhere else — an undo, or another
    // field being selected. Adopting our own echo would undo the draft.
    if (held !== null && incoming === this.pushed) return held
    return [...this.options()]
  })

  protected valueId(at: number): string {
    return `${this.headingId}-value-${String(at)}`
  }

  protected labelId(at: number): string {
    return `${this.headingId}-label-${String(at)}`
  }

  protected imageId(at: number): string {
    return `${this.headingId}-image-${String(at)}`
  }

  protected altId(at: number): string {
    return `${this.headingId}-alt-${String(at)}`
  }

  protected altText(option: FieldOption): string {
    const alt = option.image?.alt
    return typeof alt === 'string' ? alt : ''
  }

  /** The whole choice, as `withPicture` makes it: a picture taken away is a key that is gone. */
  protected setPicture(at: number, part: 'src' | 'alt', event: Event): void {
    const typed = (event.target as HTMLInputElement).value
    this.commit(
      this.draft().map((option, index) =>
        index === at
          ? withPicture(option, part === 'src' ? { src: typed } : { alt: typed })
          : option,
      ),
    )
  }

  protected labelText(option: FieldOption): string {
    const label = (option as unknown as Record<string, unknown>)['label']
    return typeof label === 'string' ? label : ''
  }

  protected describe(option: FieldOption): string {
    // Named, because "Remove" three times over is three buttons a screen reader
    // cannot tell apart, on a list where getting the wrong one loses a choice.
    const label = this.labelText(option)
    return label === '' ? String(option.value) : label
  }

  protected setValue(at: number, event: Event): void {
    const value = (event.target as HTMLInputElement).value
    this.commit(this.draft().map((option, index) => (index === at ? { ...option, value } : option)))
  }

  protected setLabel(at: number, event: Event): void {
    const label = (event.target as HTMLInputElement).value
    this.commit(this.draft().map((option, index) => (index === at ? { ...option, label } : option)))
  }

  protected add(): void {
    // A value nothing else uses and a label in the author's language: builder-core
    // decides both, for this editor and the React one.
    this.commit([...this.draft(), nextChoice(this.draft(), this.text(), this.list())])
  }

  protected remove(at: number): void {
    this.commit(this.draft().filter((_, index) => index !== at))
  }

  private commit(next: FieldOption[]): void {
    this.local.set(next)
    this.pushed = JSON.stringify(next)
    this.changed.emit(next)
  }
}
