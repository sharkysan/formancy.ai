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
 * ── WHY AN EDITOR IS ALLOWED HERE AT ALL ────────────────────────────────────
 *
 * [0052](../../../docs/decisions/0052-richtext-is-not-html.md) refused a
 * contenteditable surface, and the reason was never contenteditable itself — it
 * was HTML. An editor that hands back a string of markup makes every consumer of
 * the answer a sanitiser: this renderer, the other renderer, a CSV export, a
 * PDF, an email, somebody's dashboard. One of them gets it wrong, and stored XSS
 * is the most commonly exploited vulnerability in this product category.
 *
 * ProseMirror does not hand back markup. Its document is JSON, and — the part
 * that matters — **its schema is closed by construction**. The editor below is
 * built from exactly the nodes and marks the grammar has, so there is no
 * toolbar button, keyboard shortcut or console call that can put a heading or a
 * `<script>` into the document. That is the same discipline as the closed
 * grammar, enforced by a different mechanism, which is why this is an addition
 * to 0052 rather than a reversal of it.
 *
 * The conversion lives in `@formancy/spec` as a pure function between two JSON
 * trees, so the editor never sees the stored string and the stored string is
 * never parsed as markup. Nothing here touches `innerHTML`, and TipTap's
 * `getHTML` is deliberately never called.
 *
 * ── AND IT IS STILL UNTRUSTED ───────────────────────────────────────────────
 *
 * This runs in the browser, so what it produces is exactly as trustworthy as the
 * submission it ends up inside. A document CAN arrive carrying a
 * `javascript:` href — measured, not assumed — so `@formancy/spec` re-checks
 * every href on the way out, and the server re-parses the stored string
 * regardless of what any client claims. A configuration is a defence against
 * accidents, not against a person.
 *
 * ── WHY ITS OWN PACKAGE ─────────────────────────────────────────────────────
 *
 * ProseMirror is large and most forms have no rich-text field. Putting it in
 * `@formancy/react` would spend the renderer's byte budget on a field type most
 * consumers never use, so the renderers take an editor from the host — the same
 * shape the `file` field already uses for its uploader — and fall back to the
 * textarea-and-toolbar when there is none. A deployment that wants neither pays
 * for neither.
 *
 * It is framework-free for the same reason `core` is: TipTap's `Editor` is a
 * plain class, so React and Angular share this rather than each growing their
 * own configuration to disagree about.
 */

/**
 * The extensions the grammar maps to, and nothing else.
 *
 * Exported so the schema cannot drift from the grammar by being named in two
 * places: `index.test.ts` asserts the editor's schema is exactly this, and
 * `@formancy/spec`'s `EDITOR_NODES` and `EDITOR_MARKS` are the same list again
 * on the conversion side.
 *
 * Note what is absent. `StarterKit` would have been one line and brings
 * headings, blockquotes, code blocks, horizontal rules, strikethrough and
 * underline — six constructs with nowhere to go, each of which would silently
 * lose an answer the moment somebody used it.
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
const MARK_OF: Readonly<Record<string, string>> = {
  strong: 'bold',
  emphasis: 'italic',
  link: 'link',
}

const NODE_OF: Readonly<Record<string, string>> = {
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
    isActive: (command) => {
      const mark = MARK_OF[command]
      const node = NODE_OF[command]
      if (mark !== undefined) return editor.isActive(mark)
      if (node !== undefined) return editor.isActive(node)
      return false
    },
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
