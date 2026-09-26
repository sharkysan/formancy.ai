# 0061 — A TipTap editor over the closed grammar, not instead of it

- **Status:** accepted
- **Date:** 2026-09-26
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/tiptap/src/index.test.ts` (19 cases against a real
  ProseMirror rather than a mock: the schema admits exactly six nodes and three
  marks and has no `strike`, `heading` or `codeBlock`; nine stored answers
  survive a round trip through the editor byte-for-byte; a toolbar command
  produces the grammar and never a `<`; and a document arriving with a
  `javascript:` href does not become a link),
  `packages/spec/src/richtext-doc.test.ts` (33 cases on the conversion itself,
  including that mark nesting is rebuilt in one fixed order so an untouched
  answer is not rewritten), and the absence of any `getHTML` call in the
  repository.

## Context

[0052](0052-richtext-is-not-html.md) decided that a `richtext` answer is stored
as a small closed grammar and that **nothing ever parses it as markup**. It also
decided, in the same breath, that the editor would be "a textarea with a toolbar
over it", and gave the reason: a rich-text editor is where a form platform
usually reaches for a contenteditable surface and a sanitiser.

That second half was doing more work than it had earned. The argument in 0052 is
entirely about **HTML** — that storing markup makes every consumer of the answer
a sanitiser, this renderer, the other renderer, a CSV export, a PDF, an email,
somebody's own dashboard, and one of them will get it wrong. Stored XSS through
an uploaded or typed document is the most commonly exploited vulnerability in
this product category, and the closed grammar removes the class rather than
defending against it.

None of that is an argument against contenteditable. It is an argument against a
*string of markup* crossing the boundary. The textarea followed from conflating
the two.

The cost of the conflation is not small. A textarea with a toolbar means somebody
typing `**bold**` sees `**bold**`, and a person filling in a public form does not
know what the asterisks are for. For the field type whose entire purpose is that
the writer can see the result, that is close to not having the feature.

## Decision

**The editor is TipTap, configured from the grammar, and the stored answer does
not change.**

Three things make this an addition to 0052 rather than a reversal of it:

**ProseMirror's document is JSON, not markup.** TipTap's document model is a
plain JSON tree. `@formancy/spec` converts between that tree and the grammar's
blocks with pure functions — `toEditorDoc`, `fromEditorDoc` — so the editor never
sees the stored string and the stored string is never parsed as markup.
`getHTML()` exists on the `Editor` and is never called anywhere in this
repository.

**A ProseMirror schema is closed by construction.** The editor is built from
exactly the nodes and marks the grammar has: `doc`, `paragraph`, `text`,
`bulletList`, `orderedList`, `listItem`, and the marks `bold`, `italic`, `link`.
There is no toolbar button, keyboard shortcut or console call that can put a
heading into the document, because the document model has no heading. That is the
same discipline as the closed grammar, enforced by a different mechanism — which
is the reason an editor is admissible at all.

`StarterKit` would have been one line and is refused: it brings headings,
blockquotes, code blocks, horizontal rules, strikethrough and underline, six
constructs with nowhere to go, each of which would silently lose an answer the
moment somebody used it. The extensions are named individually and
`RICH_TEXT_EXTENSIONS` is exported so the schema and the grammar cannot drift
apart by being described in two places.

**The output is still untrusted.** The editor runs in the browser, so what it
produces is exactly as trustworthy as the submission it ends up inside. Every
href is re-checked on the way out against the same scheme list the parser uses,
and the server re-parses the stored string regardless of what a client claims. A
configuration is a defence against accidents, not against a person — and this is
not hypothetical: a document set through `setContent` **does** arrive carrying a
`javascript:` mark intact, which was measured rather than assumed.

**It is an optional package the host supplies.** ProseMirror is large and most
forms have no rich-text field, so `@formancy/tiptap` is its own package and the
renderers take an editor from the host — the same shape the `file` field already
uses for its uploader — falling back to the textarea-and-toolbar when there is
none. A deployment that wants neither pays for neither, and
`@formancy/react`'s byte budget is untouched.

It is framework-free for the same reason `core` is: TipTap's `Editor` is a plain
class, so React and Angular share one configuration rather than each growing
their own to disagree about.

## Consequences

**The textarea stays, and is not a second-class path.** It is what a host without
an editor gets, and it remains the surface the conformance driver drives, because
a `<textarea>` is a control every assistive technology already knows. Two ways to
edit one value is a real cost — `applyRichCommand` and the TipTap commands both
have to produce the same grammar — and it is paid down by both being tested
against the same parser rather than against each other.

**Mark nesting had to be canonicalised, and that was the near-miss.** Marks are
flat on a text node in an editor and nested in the grammar. Rebuilding the
nesting run-by-run is the obvious implementation and it turns `**a *b* c**` into
`**a***b*** c**` — the same meaning, a different string. An answer opened and
saved without being touched would come back *rewritten*, which presents as a
spurious revision on every form anybody merely looked at. `fromEditorDoc` groups
the longest adjacent stretch sharing a mark instead, which is what makes the
round trip an equality rather than an equivalence.

**Shapes the grammar cannot hold degrade instead of failing.** A list item with
two paragraphs is joined with a space; a nested list is flattened into its
parent; an unknown node becomes a paragraph and an unknown mark is dropped with
its text kept. Every function is total. An editor that rejects a paste is worse
than one that flattens it, because the person pasting cannot tell which part
offended it — and losing the words is the one outcome nobody forgives.

**Two href checks, both kept.** `fromEditorDoc` filters unsafe link marks and
`serialiseRichText` refuses to write an unsafe href into the string. Removing
either alone still stops the attack, so neither looks load-bearing in isolation
and a future reader could delete one as dead code. Both are kept and both are
commented, because they are reachable independently: a caller can serialise
blocks it built itself without ever passing through the editor conversion.

**A dependency, and a real one.** `@formancy/tiptap` brings ProseMirror. That is
recorded in the SOUP declaration, and it is why the package is separate and
optional rather than folded into a renderer. It is also why the extension list is
explicit: a dependency this size is one whose surface should be visible in our
own source.

**What is not claimed.** No manual screen-reader audit of the contenteditable
surface has been done. A ProseMirror editing surface is a `role="textbox"` with
`aria-multiline`, which is queryable by role and accessible name and therefore
compatible with [0034](0034-accessible-name-only.md) — but compatible with the
test suite is not the same as verified with a screen reader, and the textarea
fallback exists partly because it needs no such caveat.

## Alternatives considered

**Keeping the textarea and toolbar as the only editor.** The position 0052 took,
rejected here for the reason above: its argument was about HTML and did not reach
contenteditable. The textarea is kept as the fallback, so nothing is lost by
adding the other.

**A contenteditable written by hand.** Rejected without much thought.
Selection, caret placement, composition events, undo across mark boundaries and
paste normalisation are each a project, and ProseMirror is the library that
exists because people tried.

**`StarterKit` with the unwanted extensions removed.** Rejected as the wrong
default. A removal list is maintained against somebody else's additions: the day
TipTap adds an extension to the kit, the editor gains a construct the grammar
cannot store and nothing says so. An inclusion list fails closed.

**Storing ProseMirror's JSON as the answer instead of the grammar.** Tempting —
it would delete the conversion. Rejected because it makes the storage format
somebody else's version-controlled schema: a ProseMirror or TipTap upgrade could
change what a stored answer means, and the spec version line would no longer be
the only thing governing stored data
([0051](0051-spec-2-adds-types.md)). The grammar is also readable in a git diff
and in a CSV cell, and the JSON is neither.

**TipTap's paid extensions.** Not used, and the free ones are sufficient for this
grammar — checked, they are MIT. Depending on a commercial extension would
contradict the open-core line: the features form.io charges for are exactly the
features formancy gives away, and a rich-text editor behind someone else's
licence would be the same mistake wearing a different name.
