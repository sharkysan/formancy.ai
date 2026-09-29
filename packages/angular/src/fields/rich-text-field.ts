import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, viewChild, viewChildren } from '@angular/core'
import type { ElementRef } from '@angular/core'
import { applyRichCommand } from '@formancy/spec'
import type { RichCommand } from '@formancy/spec'
import { FormancyRichText } from '../rich-text.js'
import { injectRichTextEditorFactory } from '../rich-text-editor.js'
import type { RichTextEditorHandle } from '../rich-text-editor.js'
import { FieldComponentBase, FormancyFieldShell } from './field-shell.js'


/**
 * The rich text control, over a stored grammar rather than HTML.
 *
 * One file per control, because a control changes for its own reasons.
 * These were one 1,909-line file — the second largest in the repository,
 * and the place things went.
 */
/**
 * Formatted text, written as the restricted markup the spec defines.
 *
 * **Two surfaces over one value.** By default a toolbar over a textarea, whose
 * transformations live in `@formancy/spec` so a Bold button cannot mean one
 * thing here and something else in React. When the host provides an editor
 * factory, a contenteditable surface instead — which was refused in
 * [0052](../../../docs/decisions/0052-richtext-is-not-html.md) and admitted in
 * [0061](../../../docs/decisions/0061-tiptap-over-the-closed-grammar.md) once
 * the reason was read properly: 0052's argument was against a string of HTML
 * crossing the boundary, not against contenteditable, and a ProseMirror schema
 * built from the grammar cannot produce markup the grammar has no way to store.
 *
 * The factory is the host's because ProseMirror is larger than this whole
 * package and most forms have no rich-text field. Its absence is the default and
 * costs only the WYSIWYG surface.
 */
@Component({
  selector: 'formancy-rich-text-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormancyFieldShell, FormancyRichText],
  template: `
    <formancy-field-shell [field]="field" [label]="context.label" [path]="context.path">
      @if (make !== null) {
        <!-- The toolbar stays. An editor library brings keyboard shortcuts and
             no toolbar UI, so leaving ours out left Bold reachable by Ctrl+B and
             by no visible control. One toolbar drives either surface, over the
             same RichCommand values. The preview does go: the surface IS the
             preview, which is the whole reason somebody wanted it. -->
        <div
          role="toolbar"
          [attr.aria-label]="toolbarLabel()"
          data-formancy-part="richtext-toolbar"
          (keydown)="onToolbarKey($event)"
        >
          @for (entry of commands; track entry.command; let i = $index) {
            <button
              type="button"
              #toolbarButton
              [disabled]="field.snapshot().disabled"
              [attr.tabindex]="i === active() ? 0 : -1"
              data-formancy-part="richtext-button"
              (focus)="active.set(i)"
              (click)="press(entry.command)"
            >
              <span aria-hidden="true">{{ entry.glyph }}</span>
              <span data-formancy-part="visually-hidden">{{ entry.name }}</span>
            </button>
          }
        </div>
        <div #editorHost data-formancy-part="richtext-editor" (blur)="field.touch()"></div>
      } @else {
      <!-- The ARIA toolbar pattern: ONE tab stop for the row, arrows within
           it. Five buttons that each took a tab press would put five stops
           between a keyboard user and the box they came to type in. -->
      <div
        role="toolbar"
        [attr.aria-label]="toolbarLabel()"
        data-formancy-part="richtext-toolbar"
        (keydown)="onToolbarKey($event)"
      >
        @for (entry of commands; track entry.command; let i = $index) {
          <button
            type="button"
            #toolbarButton
            [disabled]="field.snapshot().disabled"
            [attr.tabindex]="i === active() ? 0 : -1"
            data-formancy-part="richtext-button"
            (focus)="active.set(i)"
            (click)="press(entry.command)"
          >
            <span aria-hidden="true">{{ entry.glyph }}</span>
            <span data-formancy-part="visually-hidden">{{ entry.name }}</span>
          </button>
        }
      </div>
      <textarea
        #box
        [id]="control().id"
        [attr.name]="control().name"
        [attr.aria-describedby]="control()['aria-describedby']"
        [attr.aria-invalid]="control()['aria-invalid']"
        [attr.aria-required]="control()['aria-required']"
        [disabled]="field.snapshot().disabled"
        rows="5"
        [value]="text()"
        (keydown)="onKey($event)"
        (input)="field.setValue($any($event.target).value)"
        (blur)="field.touch()"
      ></textarea>
      <div data-formancy-part="richtext-preview">
        <formancy-rich-text [source]="text()" />
      </div>
      }
    </formancy-field-shell>
  `,
})
export class FormancyRichTextField extends FieldComponentBase {
  protected readonly text = computed(() => {
    const value = this.field.snapshot().value
    return typeof value === 'string' ? value : ''
  })

  protected readonly active = signal(0)

  protected readonly commands: ReadonlyArray<{
    command: RichCommand
    name: string
    glyph: string
  }> = [
    { command: 'strong', name: 'Bold', glyph: 'B' },
    { command: 'emphasis', name: 'Italic', glyph: 'I' },
    { command: 'link', name: 'Link', glyph: '↗' },
    { command: 'bulletList', name: 'Bulleted list', glyph: '•' },
    { command: 'orderedList', name: 'Numbered list', glyph: '1.' },
  ]

  private readonly box = viewChild<ElementRef<HTMLTextAreaElement>>('box')
  private readonly toolbarButtons = viewChildren<ElementRef<HTMLButtonElement>>('toolbarButton')

  protected readonly make = injectRichTextEditorFactory()
  private readonly editorHost = viewChild<ElementRef<HTMLDivElement>>('editorHost')
  private handle: RichTextEditorHandle | undefined

  /**
   * Mount once, then feed.
   *
   * A contenteditable rebuilt when the value changes loses the caret, the
   * selection and the undo stack, which is the difference between an editor and
   * a box that fights you. So the effect mounts on its first run and afterwards
   * only pushes a value that came from somewhere other than this editor —
   * comparing first, because pushing back the change it just reported would move
   * the caret to the end after every keystroke.
   */
  private readonly mounted = effect(() => {
    const next = this.text()
    const element = this.editorHost()?.nativeElement
    const make = this.make
    if (element === undefined || make === null) return

    if (this.handle === undefined) {
      this.handle = make({
        element,
        value: next,
        onChange: (value) => {
          this.field.setValue(value)
        },
        editable: this.field.snapshot().disabled !== true,
        attributes: this.editorAttributes(),
      })
      return
    }

    if (this.handle.value() === next) return

    // And never while the person is in the editor.
    //
    // Without this the editor reverts its own change. Pressing Bold updates the
    // document, reports the new answer, and the signal re-runs this effect — but
    // for one run `next` is still the answer from BEFORE the command. That run
    // sees a difference, pushes the stale answer back, un-bolds the word and
    // reports THAT. Observed in the playground: the stored value went to
    // `**hello**` and back to `hello` on its own.
    //
    // A value arriving from elsewhere while somebody is typing is rare; losing
    // what they just did is not recoverable. So the sync waits for them to leave,
    // and the comparison above catches it then.
    if (element.contains(document.activeElement)) return

    this.handle.setValue(next)
  })

  private readonly cleanup = inject(DestroyRef).onDestroy(() => {
    // ProseMirror holds DOM listeners and a plugin state. One left per mounted
    // form is a leak that only shows up in a long-lived admin app.
    this.handle?.destroy()
    this.handle = undefined
  })

  /**
   * The engine's wiring, passed to the surface rather than invented on it.
   *
   * Byte-identical to what the React binding passes, which is the point: the ids
   * and the describedby composition are computed once in `@formancy/core`, and a
   * renderer that assembled its own would be the implementation that drifts.
   * `aria-labelledby` rather than a `<label for>` because the surface is a div,
   * and `for` does not reach one.
   */
  private editorAttributes(): Record<string, string> {
    const control = this.control()
    const props = this.field.snapshot().props
    const attributes: Record<string, string> = {
      id: control.id,
      'aria-labelledby': props.label.id,
      // The editing surface is a CHILD of the mount point, so it is the element
      // a theme has to style. Named here rather than left as the editor
      // library's own class, so a theme is not coupled to TipTap.
      'data-formancy-part': 'richtext-surface',
    }
    const describedby = control['aria-describedby']
    if (describedby !== undefined) attributes['aria-describedby'] = describedby
    if (control['aria-invalid'] !== undefined) attributes['aria-invalid'] = 'true'
    if (control['aria-required'] !== undefined) attributes['aria-required'] = 'true'
    return attributes
  }

  /** Named with the field: a form may have several of these, and "toolbar"
   *  five times says nothing about which question is being answered. */
  protected toolbarLabel(): string {
    const label = this.context.label
    return typeof label === 'string' ? `Formatting for ${label}` : 'Formatting'
  }

  protected press(command: RichCommand): void {
    if (command === 'link') {
      // A prompt rather than a dialog this package would then own the
      // accessibility of. A host wanting its own replaces the field through
      // the component registry.
      const href = window.prompt('Address for the link')
      if (href === null || href === '') return
      this.run(command, href)
      return
    }
    this.run(command)
  }

  protected onKey(event: KeyboardEvent): void {
    if (!(event.ctrlKey || event.metaKey)) return
    const key = event.key.toLowerCase()
    const command = key === 'b' ? 'strong' : key === 'i' ? 'emphasis' : undefined
    if (command === undefined) return
    event.preventDefault()
    this.run(command)
  }

  protected onToolbarKey(event: KeyboardEvent): void {
    const last = this.commands.length - 1
    const to =
      event.key === 'ArrowRight'
        ? this.active() + 1
        : event.key === 'ArrowLeft'
          ? this.active() - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : undefined
    if (to === undefined) return
    event.preventDefault()
    const index = (to + this.commands.length) % this.commands.length
    this.active.set(index)
    this.toolbarButtons()[index]?.nativeElement.focus()
  }

  private run(command: RichCommand, href?: string): void {
    // With a WYSIWYG surface mounted the markers are not what somebody
    // typed, so inserting them would put literal asterisks into their
    // answer. The command goes to the editor instead.
    if (this.handle !== undefined) {
      this.handle.run(command, href)
      return
    }

    const element = this.box()?.nativeElement
    if (element === undefined) return

    const next = applyRichCommand(
      command,
      { value: this.text(), start: element.selectionStart, end: element.selectionEnd },
      href === undefined ? {} : { href },
    )
    this.field.setValue(next.value)
    // After the signal has been written through to the DOM. An editor that
    // drops the caret to the end after every button is one nobody can use for
    // a second word.
    requestAnimationFrame(() => {
      element.focus()
      element.setSelectionRange(next.start, next.end)
    })
  }
}
