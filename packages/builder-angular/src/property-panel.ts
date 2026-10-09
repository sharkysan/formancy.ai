import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core'
import { createBuilderText, editablePropertiesFor, nameOf } from '@formancy/builder-core'
import type { BuilderText } from '@formancy/builder-core'
import type {
  BuilderSession,
  DataGridColumn,
  EditableProperty,
  FieldDef,
  FieldOption,
} from './types.js'
import { FormancyColumnsEditor } from './columns-editor.js'
import { FormancyOptionsEditor } from './options-editor.js'
import { injectBuilderView } from './view.js'

let nextId = 0

/**
 * One property's control, generated from the spec's own JSON Schema.
 *
 * Shared by the field panel and, later, the layout panel: two renderings of "a
 * property from the schema" would drift, and the drift would be invisible —
 * both panels would look fine and one would quietly stop offering a kind the
 * schema grew.
 *
 * **It keeps a draft of the text**, for the reason the options editor does. The
 * document refuses invalid states and a person typing passes through them.
 * Measured in the React panel: `span` is `anyOf: [integer, const "all"]`, so
 * typing "all" offers "a", then "al", then "all" — the first two are refused,
 * the document does not change, and a box bound straight to it re-renders empty,
 * so the next keystroke lands in an empty box. The word could not be typed at
 * all. The box shows the draft, every edit is offered to the session, and a
 * refusal leaves the document where it was.
 */
@Component({
  selector: 'formancy-property',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormancyColumnsEditor, FormancyOptionsEditor],
  template: `
    @if (property().kind === 'options') {
      <formancy-options-editor
        [options]="asOptions(value())"
        [text]="text()"
        [pictures]="property().pictures === true"
        [list]="property().list ?? 'options'"
        (changed)="changed.emit($event.length === 0 ? undefined : $event)"
      />
    } @else if (property().kind === 'columns') {
      <!-- A datagrid's columns name this field's own children, so the editor
           needs them. Nothing else in the panel does, which is why they are
           passed rather than reached for. -->
      <formancy-columns-editor
        [columns]="asColumns(value())"
        [children]="childFields()"
        [text]="text()"
        (changed)="changed.emit($event.length === 0 ? undefined : $event)"
      />
    } @else {
      <div data-formancy-part="property">
        <label [attr.for]="id">{{ property().title }}</label>

        @switch (property().kind) {
          @case ('boolean') {
            <input
              [attr.id]="id"
              [attr.aria-describedby]="hintId()"
              type="checkbox"
              [checked]="asBoolean(value())"
              (change)="onCheck($event)"
            />
          }
          @case ('enum') {
            <select
              [attr.id]="id"
              [attr.aria-describedby]="hintId()"
              (change)="onSelect($event)"
            >
              <option value="" [selected]="asText(value()) === ''"></option>
              @for (choice of property().choices ?? []; track choice) {
                <option [value]="choice" [selected]="asText(value()) === choice">{{ choice }}</option>
              }
            </select>
          }
          @case ('strings') {
            <!-- One per line, not comma-separated: a media type has no comma in
                 it but an extension list somebody pastes from elsewhere often
                 does, and a separator that appears inside a value is one that
                 silently splits it. -->
            <textarea
              [attr.id]="id"
              [attr.aria-describedby]="hintId()"
              rows="3"
              [value]="asLines(value())"
              (input)="onLines($event)"
            ></textarea>
          }
          @default {
            <input
              [attr.id]="id"
              [attr.aria-describedby]="hintId()"
              [attr.type]="property().kind === 'number' ? 'number' : 'text'"
              [value]="draft()"
              (input)="onText($event)"
            />
          }
        }

        @if (property().description !== '') {
          <p [attr.id]="id + '-hint'" data-formancy-part="property-hint">
            {{ property().description }}
          </p>
        }
      </div>
    }
  `,
})
export class FormancyProperty {
  readonly property = input.required<EditableProperty>()
  readonly value = input<unknown>(undefined)
  /** The field's own children, which only the columns editor needs. */
  readonly childFields = input<readonly FieldDef[]>([])
  /** The session's language, for the two editors that have words of their own. */
  readonly text = input<BuilderText>(createBuilderText())
  readonly changed = output<unknown>()

  protected readonly id = `formancy-property-${String((nextId += 1))}`

  private readonly local = signal<string | null>(null)
  /** What this control last sent, so its own echo is not adopted as a change. */
  private pushed = ''

  protected readonly hintId = computed(() =>
    this.property().description === '' ? null : `${this.id}-hint`,
  )

  protected readonly draft = computed((): string => {
    const incoming = this.asText(this.value())
    const held = this.local()
    if (held !== null && incoming === this.pushed) return held
    return incoming
  })

  protected asText(raw: unknown): string {
    return typeof raw === 'string' || typeof raw === 'number' ? String(raw) : ''
  }

  protected asBoolean(raw: unknown): boolean {
    return typeof raw === 'boolean' ? raw : this.property().default === true
  }

  protected asLines(raw: unknown): string {
    return Array.isArray(raw) ? (raw as unknown[]).map(String).join('\n') : ''
  }

  protected asOptions(raw: unknown): FieldOption[] {
    return Array.isArray(raw) ? (raw as FieldOption[]) : []
  }

  protected asColumns(raw: unknown): DataGridColumn[] {
    return Array.isArray(raw) ? (raw as DataGridColumn[]) : []
  }

  protected onCheck(event: Event): void {
    this.changed.emit((event.target as HTMLInputElement).checked)
  }

  protected onSelect(event: Event): void {
    this.changed.emit((event.target as HTMLSelectElement).value)
  }

  protected onLines(event: Event): void {
    const next = (event.target as HTMLTextAreaElement).value
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '')
    this.changed.emit(next.length === 0 ? undefined : next)
  }

  protected onText(event: Event): void {
    const raw = (event.target as HTMLInputElement).value
    const property = this.property()

    if (property.kind !== 'number') {
      // A property the format writes as "a number or a word" — `span` is
      // `anyOf: [integer, const "all"]` — needs the number handed over AS a
      // number. Read from the schema, never from the property's name, so the
      // next one written that way works without anybody remembering this.
      if (property.numericAlternative === true && /^-?\d+(\.\d+)?$/.test(raw)) {
        this.offer(raw, Number(raw))
        return
      }
      this.offer(raw, raw === '' ? undefined : raw)
      return
    }
    // A half-typed number is not a number. Sending NaN would fail validation on
    // every keystroke of "1e", so an unparseable box reads as cleared until it
    // parses.
    const parsed = Number(raw)
    this.offer(raw, raw === '' || Number.isNaN(parsed) ? undefined : parsed)
  }

  private offer(text: string, parsed: unknown): void {
    this.local.set(text)
    this.pushed = this.asText(parsed)
    this.changed.emit(parsed)
  }
}

/**
 * The property panel: what the schema says this field type has.
 *
 * Generated rather than written out per type. Hand-write twenty-five panels and
 * they rot within two releases; generated, a property the format grows appears
 * with its own title and description and nobody has to remember it exists.
 *
 * The definition comes from the SESSION rather than from an input. A panel handed
 * a definition captured before the edit renders controls whose value never
 * changes, so every keystroke resets the box and only the last character
 * survives — a bug any consumer would reproduce by wiring it the obvious way.
 */
@Component({
  selector: 'formancy-property-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormancyProperty],
  template: `
    @if (def(); as field) {
      <div data-formancy-part="property-panel">
        <h2>{{ heading() }}</h2>
        <p data-formancy-part="property-panel-type">{{ field.type }}</p>

        @for (property of properties(); track property.name) {
          <formancy-property
            [property]="property"
            [value]="valueOf(property.name)"
            [childFields]="field.fields ?? []"
            [text]="session().text"
            (changed)="set(property.name, $event)"
          />
        }
      </div>
    }
  `,
})
export class FormancyPropertyPanel {
  readonly session = input.required<BuilderSession>()
  /** The field being edited. Its definition is read from the live document. */
  readonly keyPath = input.required<readonly string[]>()

  protected readonly view = injectBuilderView(this.session)

  protected readonly def = computed((): FieldDef | undefined => {
    const path = this.keyPath()
    return this.view().nodes.find(
      (candidate) =>
        candidate.keyPath.length === path.length &&
        candidate.keyPath.every((key, at) => key === path[at]),
    )?.def
  })
  protected readonly heading = computed(() => {
    const field = this.def()
    return field === undefined ? '' : nameOf(this.view().document, field)
  })
  protected readonly properties = computed((): EditableProperty[] => {
    const field = this.def()
    return field === undefined ? [] : editablePropertiesFor(field.type, field.widget, this.session().text)
  })

  protected valueOf(name: string): unknown {
    return (this.def() as unknown as Record<string, unknown> | undefined)?.[name]
  }

  protected set(name: string, value: unknown): void {
    // An empty box means "no value", not "the empty string". Writing '' would put
    // a property into the document the author just cleared, and `minLength: ''`
    // is not a thing the schema accepts.
    this.session().setFieldProperty(
      this.keyPath(),
      name,
      value === '' || value === undefined ? undefined : value,
    )
  }
}
