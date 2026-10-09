import { ChangeDetectionStrategy, Component, input, linkedSignal, output } from '@angular/core'
import type { BuilderBlock, BuilderText } from '@formancy/builder-core'
import { BuilderTextPipe } from './text.pipe.js'

/**
 * The blocks section of the add palette: the host's saved pieces of a form, offered beside
 * the field types (0135). A component of its own so the tree's file stays the tree's, and
 * the React builder draws the same section from the same words.
 */
@Component({
  selector: 'formancy-palette-blocks',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BuilderTextPipe],
  template: `
    <section data-formancy-part="palette-blocks" aria-labelledby="formancy-palette-blocks">
      <h3 id="formancy-palette-blocks">{{ 'blocks.heading' | builderText: text() }}</h3>
      @if (blocks().length === 0) {
        <p data-formancy-part="palette-hint">{{ 'blocks.none' | builderText: text() }}</p>
      } @else {
        <ul>
          @for (block of blocks(); track block.id) {
            <li>
              <button type="button" (click)="chosen.emit(block)">{{ block.name }}</button>
              @if (block.description) {
                <span data-formancy-part="palette-hint">{{ block.description }}</span>
              }
            </li>
          }
        </ul>
      }
    </section>
  `,
})
export class FormancyPaletteBlocks {
  readonly blocks = input.required<readonly BuilderBlock[]>()
  readonly text = input.required<BuilderText>()
  readonly chosen = output<BuilderBlock>()
}

/**
 * Naming a block before it is saved. It starts as the field's own name, which is usually
 * what the block is; the builder saves it and says what happened.
 */
@Component({
  selector: 'formancy-save-block',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BuilderTextPipe],
  template: `
    <div
      role="dialog"
      [attr.aria-label]="'blocks.save' | builderText: text()"
      data-formancy-part="save-block"
    >
      <label>
        {{ 'blocks.name' | builderText: text() }}
        <input
          type="text"
          [value]="name()"
          (input)="name.set($any($event.target).value)"
          (keydown.enter)="save.emit(name())"
        />
      </label>
      <button type="button" (click)="save.emit(name())">
        {{ 'blocks.saveConfirm' | builderText: text() }}
      </button>
      <button type="button" (click)="cancel.emit()">
        {{ 'dialog.cancel' | builderText: text() }}
      </button>
    </div>
  `,
})
export class FormancySaveBlock {
  readonly text = input.required<BuilderText>()
  /** The name it starts with. */
  readonly initialName = input.required<string>()
  readonly save = output<string>()
  readonly cancel = output<void>()

  /** What the person typed, starting from the field's name and following it if it changes. */
  protected readonly name = linkedSignal(() => this.initialName())
}
