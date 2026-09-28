/**
 * The public surface of `@formancy/tiptap`.
 *
 * The editor itself is in `rich-text-editor.ts`. It lived here, and
 * `vitest.coverage.ts` excludes every `src/index.ts` on the grounds that a barrel has
 * no behaviour — so this package's coverage measured nothing at all.
 */
export { RICH_TEXT_EXTENSIONS, createRichTextEditor, storedValueOf } from './rich-text-editor.js'
export type { RichTextEditor, RichTextEditorOptions } from './rich-text-editor.js'
