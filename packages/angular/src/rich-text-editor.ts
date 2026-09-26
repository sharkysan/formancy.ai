import { InjectionToken, inject } from '@angular/core'
import type { RichCommand } from '@formancy/spec'

/**
 * A rich-text editing surface, supplied by the host.
 *
 * The same contract the React binding uses, deliberately to the letter: one
 * interface, one factory, one set of attributes. A renderer that invented its own
 * shape here would be the drift the conformance suite exists to prevent, except
 * in the one place the suite cannot see — what the HOST passes in.
 *
 * Why the host and not this package: a contenteditable editor means ProseMirror,
 * which is larger than this entire package, and most forms have no rich-text
 * field. Without a factory the field is a textarea with a toolbar, which is a
 * working editor and not a degraded mode
 * ([0061](../../../docs/decisions/0061-tiptap-over-the-closed-grammar.md)).
 *
 * What crosses this boundary is **the stored grammar in both directions, never
 * markup**. That is the whole reason an editor is admissible: nothing on either
 * side holds a string of HTML, so no consumer of an answer becomes a sanitiser
 * ([0052](../../../docs/decisions/0052-richtext-is-not-html.md)).
 */
export interface RichTextEditorHandle {
  /** The stored answer, in the grammar. */
  value: () => string
  /** Replace the content when the form's value changes underneath the editor. */
  setValue: (value: string) => void
  /**
   * Run a formatting command, so the field's own toolbar keeps working.
   *
   * Needed because an editor library brings keyboard shortcuts and no toolbar
   * UI. Leaving the field's toolbar out made Bold reachable by Ctrl+B and by no
   * visible control, which is a regression against the `<textarea>` it replaced
   * and unusable for anybody who does not know the shortcut.
   *
   * The commands are the grammar's whole surface — the same `RichCommand`
   * values the textarea's toolbar uses — so one toolbar drives either surface
   * and the two cannot offer different things.
   */
  run: (command: RichCommand, href?: string) => void
  /** Whether the command is on at the caret, for the toolbar's pressed state. */
  isActive: (command: RichCommand) => boolean
  destroy: () => void
}

export interface RichTextEditorMount {
  /** Where to mount. The host's factory owns what it puts inside. */
  readonly element: Element
  /** The stored answer to open with, in the grammar. */
  readonly value: string
  /** Called with the new stored answer, in the grammar. */
  readonly onChange: (value: string) => void
  readonly editable: boolean
  /**
   * Attributes for the editing surface itself, so the ENGINE keeps owning the
   * accessibility wiring.
   *
   * These ids are minted by `@formancy/core` and composed centrally, which is
   * what makes `aria-describedby` identical in both renderers rather than
   * correct in one of them. An editor package that labelled its own surface
   * would be a third implementation, and the one nobody tests.
   */
  readonly attributes: Readonly<Record<string, string>>
}

export type RichTextEditorFactory = (mount: RichTextEditorMount) => RichTextEditorHandle

/**
 * Optional by design, and its absence costs less than the uploader's.
 *
 * A missing uploader makes a file field read-only, because there is nowhere to
 * put the bytes. A missing editor costs only the WYSIWYG surface: the answer is
 * still editable, still valid, and still the same grammar.
 */
export const FORMANCY_RICH_TEXT_EDITOR = new InjectionToken<RichTextEditorFactory>(
  'formancy.richTextEditor',
)

export function injectRichTextEditorFactory(): RichTextEditorFactory | null {
  return inject(FORMANCY_RICH_TEXT_EDITOR, { optional: true })
}

/** Providing one, for a host that wants the contenteditable surface. */
export function provideFormancyRichTextEditor(make: RichTextEditorFactory) {
  return { provide: FORMANCY_RICH_TEXT_EDITOR, useValue: make }
}
