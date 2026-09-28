import { fromEditorDoc, parseRichText, serialiseRichText, toEditorDoc } from '@formancy/spec'
import type { EditorNode, RichCommand } from '@formancy/spec'
import { Editor } from '@tiptap/core'
import type { Extensions, JSONContent } from '@tiptap/core'
import Bold from '@tiptap/extension-bold'
import BulletList from '@tiptap/extension-bullet-list'
import Document from '@tiptap/extension-document'
import Italic from '@tiptap/extension-italic'
import Link from '@tiptap/extension-link'
import ListItem from '@tiptap/extension-list-item'
import OrderedList from '@tiptap/extension-ordered-list'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'

/**
 * A TipTap editor that cannot produce anything the grammar cannot store.
 *
 * Built from exactly the nodes and marks the grammar has, so **no toolbar button,
 * keyboard shortcut or console call can put a heading or a `<script>` into the
 * document**: ProseMirror's schema is closed by construction. The conversion between the
 * editor's JSON and the stored string lives in `@formancy/spec`, so the editor never
 * sees the stored string and the stored string is never parsed as markup. Nothing here
 * touches `innerHTML`, and `getHTML` is never called.
 *
 * **What it produces is still untrusted.** It runs in the browser, so a document can
 * arrive carrying a `javascript:` href whatever this configuration allows — the spec
 * re-checks every href on the way out and the server re-parses the stored string
 * regardless of what a client claims.
 *
 * Why an editor is allowed here at all, and why it is its own package rather than part
 * of `@formancy/react`: [0052](../../../docs/decisions/0052-richtext-is-not-html.md).
 */

export const RICH_TEXT_EXTENSIONS: Extensions = [
  Document,
  Paragraph,
  Text,
  Bold,
  Italic,
  BulletList,
  OrderedList,
  ListItem,
  Link.configure({
    // The grammar's scheme list is the authority and `@formancy/spec` applies
    // it. These settings only stop the editor from *offering* what would then be
    // dropped, which is the difference between a link that never appears and one
    // that vanishes after saving.
    protocols: ['http', 'https', 'mailto'],
    autolink: false,
    openOnClick: false,
  }),
]

export interface RichTextEditorOptions {
  /** The stored answer, in the grammar. Not HTML, ever. */
  readonly value: string
  /** Where the editor mounts. Omitted in a test, or for a headless host. */
  readonly element?: Element
  /** Called with the new stored answer — again the grammar, never markup. */
  readonly onChange?: (value: string) => void
  readonly editable?: boolean
  /**
   * Attributes for the editing surface, so the ENGINE keeps owning the
   * accessibility wiring.
   *
   * The ids and `aria-describedby` composition are minted centrally by
   * `@formancy/core` and are what make the wiring correct in both renderers
   * rather than in three separate implementations. This package inventing its own
   * labelling would make it the fourth, and the one nobody tests. So the
   * renderer passes them in and this passes them straight to the contenteditable.
   */
  readonly attributes?: Readonly<Record<string, string>>
}

/**
 * A mounted editor and the stored answer inside it.
 *
 * `value()` is deliberately the only way to read the content out. TipTap will
 * happily hand a caller `getHTML()`, and the point of this package is that
 * nobody ever does — so the conversion has exactly one home and a host cannot
 * reach past it without meaning to.
 */
export interface RichTextEditor {
  /** For mounting and focus. */
  readonly editor: Editor
  /** The stored answer, converted from the editor's document. */
  value: () => string
  /** Replace the content, e.g. when the form's value changes underneath. */
  setValue: (value: string) => void
  /**
   * Run one of the grammar's formatting commands.
   *
   * This exists so the FIELD's toolbar keeps working. TipTap registers the usual
   * keyboard shortcuts and brings no toolbar UI, so an editor mounted without
   * this leaves Bold reachable by Ctrl+B and by no visible control — worse
   * than the textarea it replaced, and unusable for anybody who does not already
   * know the shortcut.
   *
   * Deliberately the same `RichCommand` values the textarea's toolbar uses, so
   * one toolbar drives either surface and the two cannot come to offer different
   * things.
   */
  run: (command: RichCommand, href?: string) => void
  /** Whether the command is on at the caret, for the toolbar's pressed state. */
  isActive: (command: RichCommand) => boolean
  destroy: () => void
}

/**
 * The grammar's commands, in TipTap's vocabulary.
 *
 * One mapping, in one place: a second one anywhere would be the drift this
 * package exists to prevent, and the mark names are already pinned to the
 * grammar by `EDITOR_MARKS`.
 */
const TIPTAP_NAME_OF: Readonly<Record<RichCommand, string>> = {
  strong: 'bold',
  emphasis: 'italic',
  link: 'link',
  bulletList: 'bulletList',
  orderedList: 'orderedList',
}

export function createRichTextEditor(options: RichTextEditorOptions): RichTextEditor {
  const contentOf = (value: string): JSONContent =>
    toEditorDoc(parseRichText(value)) as JSONContent

  const editor = new Editor({
    ...(options.element === undefined ? {} : { element: options.element }),
    extensions: RICH_TEXT_EXTENSIONS,
    editable: options.editable ?? true,
    content: contentOf(options.value),
    editorProps: {
      attributes: {
        // A contenteditable is a textbox to assistive technology only if it says
        // so. `aria-multiline` is not optional here: without it the surface is
        // announced as a single-line field, and somebody using a screen reader
        // is told the wrong thing about what Enter will do.
        'aria-multiline': 'true',
        ...(options.attributes ?? {}),
      },
    },
    ...(options.onChange === undefined
      ? {}
      : {
          onUpdate: ({ editor: current }) => {
            options.onChange?.(storedValueOf(current))
          },
        }),
  })

  return {
    editor,
    value: () => storedValueOf(editor),
    run: (command, href) => {
      // Focus first: a toolbar button takes focus from the surface, and a
      // command applied without a selection to apply it to silently does
      // nothing, which reads as a broken button.
      const chain = editor.chain().focus()

      if (command === 'strong') chain.toggleBold()
      else if (command === 'emphasis') chain.toggleItalic()
      else if (command === 'bulletList') chain.toggleBulletList()
      else if (command === 'orderedList') chain.toggleOrderedList()
      else if (href === undefined || href === '') chain.unsetLink()
      else chain.setLink({ href })

      chain.run()
    },
    // `editor.isActive` takes one name whether it is a mark or a node, so the split the
    // first version kept -- two maps and a fallback for a command in neither -- bought
    // nothing and left a branch no legal command could reach. Keyed by the command union
    // instead: a new command fails to compile until it has a name here, which is the
    // check the fallback was standing in for.
    isActive: (command) => editor.isActive(TIPTAP_NAME_OF[command]),
    setValue: (value) => {
      // `emitUpdate: false` so loading a value does not read back as somebody
      // having edited it, which would mark a pristine form dirty.
      editor.commands.setContent(contentOf(value), { emitUpdate: false })
    },
    destroy: () => editor.destroy(),
  }
}

/**
 * One editor document, as the stored answer.
 *
 * `getJSON` rather than `getHTML`, and then through the grammar's own
 * conversion — which is where the href re-check and the degrading of shapes the
 * grammar cannot hold happen.
 */
export function storedValueOf(editor: Editor): string {
  return serialiseRichText(fromEditorDoc(editor.getJSON() as EditorNode))
}
