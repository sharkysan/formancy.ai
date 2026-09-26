---
title: Rich text
description: Why a formatted answer is stored as a small closed grammar rather than as HTML, how to plug in the TipTap editor, and what you get if you do not.
---

A `richtext` field collects formatted text. What the submission stores is **not
HTML**:

```json
{
  "notes": "Please call **before** noon. See the [map](https://example.ch/map)."
}
```

That is the whole format. Bold, italic, links, bulleted and numbered lists,
paragraphs separated by a blank line. Nothing else is expressible, and nothing
anywhere parses it as markup.

## Why not HTML

Storing HTML makes every consumer of the answer a sanitiser — this renderer, the
other renderer, a CSV export, a PDF, an email, your own dashboard — and one of
them will get it wrong. Stored cross-site scripting through a typed document is
the most commonly exploited vulnerability in this product category.

The stored string is parsed **once**, in `@formancy/spec`, into a typed tree, and
each renderer builds elements from that tree. There is no path from an answer to
`innerHTML`, no sanitiser to keep correct forever, and a `javascript:` link
renders as the characters somebody typed. A new consumer of the data cannot get
it wrong by default, because the shape it receives is already safe.

Read it in whatever your code already has:

```ts
import { parseRichText, richTextToPlain } from '@formancy/spec'

parseRichText(answer)     // a typed tree: paragraphs, lists, marks
richTextToPlain(answer)    // for a CSV cell, a search index, a summary
```

`richTextToPlain` exists so that no consumer writes its own — the alternative is
somebody doing it with a regular expression over the source.

## Two editors, and you pick

**By default, a toolbar over a `<textarea>`**, with a live preview from the same
parser that will display the answer. It needs nothing installed, it works with
every assistive technology already, and it has none of the caret, selection and
focus problems of a contenteditable. Its cost is that somebody typing sees
`**bold**`, which is why the preview is there.

**Or a real editing surface**, if you provide one. `@formancy/tiptap` is a
[TipTap](https://tiptap.dev) editor configured from the grammar:

```sh
pnpm add @formancy/tiptap
```

```tsx
import { FormancyForm, FormancyProvider, RichTextEditorProvider } from '@formancy/react'
import { createRichTextEditor } from '@formancy/tiptap'

<RichTextEditorProvider value={createRichTextEditor}>
  <FormancyProvider engine={engine}>
    <FormancyForm />
  </FormancyProvider>
</RichTextEditorProvider>
```

Angular, through DI:

```ts
import { provideFormancy, provideFormancyRichTextEditor } from '@formancy/angular'
import { createRichTextEditor } from '@formancy/tiptap'

providers: [provideFormancy(engine), provideFormancyRichTextEditor(createRichTextEditor)]
```

That is the whole integration. The field switches surface; nothing else changes.

### Why you have to ask for it

ProseMirror is larger than the React renderer, and most forms have no rich-text
field. A form platform that put it in the default bundle would charge every
consumer for a field type most of them never use. So the renderers take an editor
from the host — the same arrangement the `file` field uses for its uploader — and
a deployment that does not provide one never loads it.

The fallback is not a degraded mode. The answer is still editable, still
validated, and still the same grammar, so you can add or remove the editor later
without touching a stored submission.

## The editor cannot widen the format

This is the part worth understanding before you trust it.

A ProseMirror schema is closed by construction. The editor is built from exactly
the nodes and marks the grammar has — `paragraph`, `text`, the three list nodes,
and `bold`, `italic`, `link` — so there is no toolbar button, keyboard shortcut,
paste or console call that can put a heading into the document, because the
document model has no heading. `@tiptap/starter-kit` is deliberately **not** used:
it is one line and brings headings, blockquotes, code blocks, horizontal rules,
strikethrough and underline, six constructs with nowhere to go, each of which
would silently lose part of an answer the moment somebody used it.

Nothing calls TipTap's `getHTML`. What crosses the boundary between the editor
and the form is the stored grammar, in both directions.

And the editor is still **untrusted**, because it runs in the browser: every link
is re-checked against the same scheme list the parser uses on the way out, and
the server re-parses the stored string regardless of what a client sends. A
configuration is a defence against accidents, not against a person.

## Writing your own editor

`RichTextEditorProvider` takes any factory matching the interface, so
`@formancy/tiptap` is one implementation rather than the only one:

```ts
type RichTextEditorFactory = (mount: {
  element: Element
  value: string            // the stored grammar, never HTML
  onChange: (value: string) => void   // likewise
  editable: boolean
  attributes: Readonly<Record<string, string>>
}) => {
  value: () => string
  setValue: (value: string) => void
  destroy: () => void
}
```

Three obligations, each of which caused a real bug before it was written down:

**Return the grammar, not markup.** `@formancy/spec` exports `toEditorDoc`,
`fromEditorDoc` and `serialiseRichText` if you are building on a tree-shaped
editor; they are pure functions over JSON.

**Apply `attributes` to the editing surface itself.** They carry the ids and the
`aria-describedby` composition that the engine mints centrally. That is what makes
the wiring identical in React and Angular instead of correct in one of them, and
an editor that labels its own surface is a third implementation nobody tests.

**Do not rebuild on every value change.** Mount once and use `setValue` only when
the value came from somewhere other than your own editor — compare against
`value()` first. Pushing back the change you just reported moves the caret to the
end after every keystroke.

## What is not claimed

No manual screen-reader audit of the contenteditable surface has been done. It is
a `role="textbox"` with `aria-multiline`, queryable by role and accessible name,
which is what the conformance suite requires — but passing an automated suite is
not the same as having been driven with NVDA. The textarea is the default partly
because it needs no such caveat.

The reasoning behind all of this is in
[0052](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0052-richtext-is-not-html.md)
and
[0061](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0061-tiptap-over-the-closed-grammar.md),
including why 0061 revisits 0052 without changing what is stored.
