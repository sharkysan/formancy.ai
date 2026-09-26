import { createContext, useContext } from 'react'
import type { RichCommand } from '@formancy/spec'

/**
 * A rich-text editing surface, supplied by the host.
 *
 * The same split as the uploader, for the same reason. A contenteditable editor
 * means ProseMirror, and ProseMirror is larger than this entire package — so a
 * form with no rich-text field, which is most of them, must not pay for one.
 * The host passes a factory; without one the field is a textarea with a toolbar,
 * which is a working editor and not a degraded mode
 * ([0061](../../../docs/decisions/0061-tiptap-over-the-closed-grammar.md)).
 *
 * What crosses this boundary is **the stored grammar in both directions, never
 * markup**. That is the whole reason an editor is admissible: nothing on either
 * side of this interface holds a string of HTML, so no consumer of an answer
 * becomes a sanitiser ([0052](../../../docs/decisions/0052-richtext-is-not-html.md)).
 * A factory that returned HTML here would be the bug this design exists to
 * prevent, which is why the type says `string` and the documentation says which
 * string.
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
   * The ids in here are minted by the engine and composed centrally, which is
   * what makes `aria-describedby` correct in both renderers rather than in
   * three separate implementations. An editor package that invented its own
   * labelling would be the fourth implementation, and the one nobody tests.
   */
  readonly attributes: Readonly<Record<string, string>>
}

export type RichTextEditorFactory = (mount: RichTextEditorMount) => RichTextEditorHandle

const RichTextEditorContext = createContext<RichTextEditorFactory | undefined>(undefined)

export const RichTextEditorProvider = RichTextEditorContext.Provider

/**
 * The host's editor factory, or undefined when there is none.
 *
 * Undefined is a supported state and the default one. Unlike the uploader — where
 * its absence makes a file field read-only, because there is nowhere to put the
 * bytes — its absence here costs nothing but the WYSIWYG surface: the answer is
 * still editable, still valid, and still the same grammar.
 */
export function useRichTextEditorFactory(): RichTextEditorFactory | undefined {
  return useContext(RichTextEditorContext)
}
