# 0052 — A formatted-text answer is not HTML

- **Status:** accepted
- **Date:** 2026-09-22
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/spec/src/richtext.test.ts` (30 cases, including
  every scheme a link may not use, angle brackets staying characters, and four
  shapes that make naive parsers hang), plus the renderer cases in
  `packages/react/src/new-types.test.tsx` and
  `packages/angular/src/new-types.test.ts` that type a script tag into the
  field and look for an element that is not there.

## Context

A `richtext` field lets somebody write a few lines with emphasis, a link and a
list. Every product in this category stores that as HTML.

Which means: text written by anyone who can reach a public form, stored, and
later opened by an administrator. That is the exact shape of stored
cross-site scripting, and it is the most commonly exploited vulnerability in
this product category — the same reason
[the deployment notes](../architecture/07-deployment-view.md) refuse to serve
uploaded files from the application origin.

Storing HTML also spreads the problem. Every consumer of the data has to
sanitise, correctly, forever: this renderer, the other renderer, the CSV
export, a PDF, an email, a customer's own dashboard, a support tool somebody
writes in an afternoon. One of them will not, and the one that does not is
usually the one an administrator is looking at.

## Decision

**The stored answer is never parsed as markup by anything.**

It is a small closed grammar — paragraphs, bullet and numbered lists, bold,
italic, links — parsed once in `@formancy/spec` into a typed tree of
`{ kind: 'text' | 'strong' | 'emphasis' | 'link' }` nodes. Each renderer walks
that tree and creates elements. React never sees `dangerouslySetInnerHTML`;
Angular never sees `[innerHTML]` or `DomSanitizer`.

There is nothing to sanitise, which is the point. A text node cannot be an
element however it is spelled, so a new consumer is safe by default rather than
safe if it remembers. `richTextToPlain` is exported for the consumers that want
words rather than structure, so nobody writes their own with a regular
expression.

**A link may use `http:`, `https:` or `mailto:` and nothing else.** Anything
else renders as the literal text somebody typed — visible, harmless, and
honest. Dropping it silently would leave a reader wondering where their link
went. Rendered links carry `rel="noreferrer noopener nofollow ugc"`, because
the destination was written by whoever filled the form in and the page showing
it is usually an administrator's.

**The parser is hand-written and scans once.** The regular expressions for
nested emphasis are exactly the shape `recheck` rejects elsewhere in this
codebase ([0045](0045-reject-backtracking-patterns.md)), and the input is
attacker-controlled text the server parses. It cannot backtrack, and four
pathological inputs are in the test suite to keep that true.

**The grammar is deliberately tiny.** No headings, no images, no tables, no raw
HTML. A form answer is not a document. Every construct beyond these is another
thing two renderers can disagree about, another row in an accessibility audit,
and another thing to migrate if the grammar ever changes.

## Consequences

**What it buys.** There is no path from an answer to an element, so there is no
sanitiser to keep current and no consumer that can get it wrong by being
written later. The two renderers cannot disagree about what an answer means,
because they read the same tree from the same parser — the promise the engine
makes across browser and server, applied to presentation.

**What it costs.** Somebody pasting formatted text from a word processor gets
plain text. The grammar is smaller than people expect, and the difference will
be reported as a missing feature rather than as a decision. Widening it later
is possible and cheap; narrowing it after people have stored things is not,
which is why it starts here.

**The editor is a textarea.** Not a contenteditable surface — a deliberate v1
cut rather than laziness. A WYSIWYG editor is a large accessibility surface of
its own (keyboard shortcuts, an announced selection model, focus management
inside a rich region) and half of one is worse than a textarea every assistive
technology already understands. A live preview, from the same parser, is what
teaches the grammar in the meantime.

## Alternatives considered

**HTML plus a sanitiser.** Rejected: it makes correctness a property of every
consumer forever rather than of the format, and it is the arrangement that
produces the vulnerability this decision exists to avoid.

**A JSON document model**, like ProseMirror's. Rejected for v1 as more shape
than the content needs — and it needs an editor that can produce it, which is
the contenteditable surface cut above. The tree this grammar parses into is
close enough that moving later is a parser change rather than a data migration.

**Full Markdown, through a library.** Rejected: CommonMark includes raw HTML by
specification, so the sanitiser comes straight back. Turning it off leaves a
dialect that is nearly-but-not-quite Markdown, which is worse than a small
grammar that does not claim to be.
