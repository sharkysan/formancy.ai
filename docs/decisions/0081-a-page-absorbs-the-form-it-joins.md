# 0081 — The first page absorbs the form it is added to

- **Status:** accepted
- **Date:** 2026-09-29
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/builder-core/src/session.test.ts`, *'the first page takes the
  fields that were already at the top level'* and *'a field can no longer be dropped beside
  a page, because it would vanish'* — both observed failing before the command existed.
  `packages/builder-react/src/builder.test.tsx`, *'p makes the form a wizard, and says what
  it did to the fields'*. The second rule also required correcting a test that asserted the
  opposite (*'a leaf may land in any container'*), which is recorded below rather than
  quietly rewritten.

## Context

A wizard was the one thing a developer could write by hand and an author could not make.
The format has `page`; the engine walks the pages, validates the one being left and
refuses to advance past a problem; both renderers draw a stepper with the pages named;
`insertField` would take a page quite happily. What was missing was a route to it in the
builder. The palette leaves `page` out on purpose — a page may sit only at the top level,
and a palette that can target any container would offer a choice refused most of the time
— and the comment there said "adding a page is its own command", which had never been
written.

Writing it raised a question the format does not answer: **what happens to the fields
already at the top level?** `validateSchema` permits a field beside a page. So the
obvious command — append an empty page and leave everything else alone — produces a
document the validator accepts.

**Measured, against the built engine rather than read off the source.** Given
`bare1`, `page one`, `bare2`, `page two`, with `bare2` sitting *between* the two pages:

```
pages:  p1, p2
bare1   pageOf = 0
a       pageOf = 0     (inside page one)
bare2   pageOf = 0     (between the pages in the document)
b       pageOf = 1     (inside page two)
```

A top-level field that is not inside a page is given to **page one wherever it sits**.
`bare2` is drawn between the two pages and belongs to the first. That is not a bug to
fix in the engine — pages are transparent for data, deliberately, so a paged and an
unpaged form produce the same submission — but it means a builder tree cannot draw a
loose field honestly. It would show a field between two pages that renders on neither
of the places the tree suggests.

## Decision

**`addPage` on an unpaged form takes the fields that are at the top level.** "Add a page"
to a form that has none means "make this form a wizard", and what somebody already built
becomes page one. On a form that already has pages it appends an empty one, which is the
same splice with nothing to move.

```ts
const paged = top.some((field) => field.type === 'page')
const page: FieldDef = {
  key: nextPageKey(draft),
  type: 'page',
  ...(label === undefined ? {} : { label }),
  fields: paged ? [] : top.splice(0, top.length),
}
top.push(page)
```

One undoable step, including the absorbing case, which moves every field in the form and
adds a container. A gesture that takes two presses of undo to reverse is one people stop
trusting.

**And once a form has pages, `validTargets` no longer offers the bare top level.** A
field may go inside a page; it may not go beside one. This is the half that makes the
first half hold: without it, the next insertion puts a loose field back and the tree is
lying again by the end of the afternoon.

**The key is counted and the label is the author's.** `page1`, `page2`, … from the number
of pages there are, while the label is what the stepper shows. Deriving one from the other
would make renaming a step a key change, and a key change is a data migration
([0011](0011-declared-renames.md) on why a key is identity and a rename is declared).

## Consequences

**A builder can produce a wizard, which is what this was for.** `p` in the structure tree,
beside `a`, `m` and `Delete`, and in the legend the tree renders so it can be found rather
than told. Keyboard first and a drag surface later, as every other command here was built
— WCAG 2.2 SC 2.5.7 wants the keyboard path to be the equal of the pointer one, and a
builder that adds it afterwards never quite gets it.

**It is announced, because it moves every field in the form.** "Added Page 1, holding the
2 fields that were at the top level. The form is a wizard now." A command that silently
rearranges the whole document is one an author has to verify by reading the tree.

**A test had to be corrected rather than the code.** `commands.test.ts` asserted *'a leaf
may land in any container'* and included the top level of a paged form. It was true of the
validator and false of the engine, which is exactly the disagreement `CLAUDE.md` says to
resolve before changing either — the test encoded a placement that does not render where
it is drawn. It now asserts the opposite, with the measurement in the comment, and a
second case holds the line that an *unpaged* form still offers its top level.

**A form cannot be un-paged from the builder yet.** Removing the only page removes its
fields with it, because `removeField` removes a container and its contents. "Unwrap this
page" is the missing inverse, and it is `unwrapLayoutNodes`' equivalent for the model
tree, which does not exist. Named here rather than left for somebody to discover.

**Conditional page routing is still absent**, and is a spec version rather than a command:
skipping a page on an answer is a new rule kind. The pages a form has had to stop being a
developer-only feature before they start branching.

## Alternatives considered

**Append an empty page and leave the loose fields alone.** The obvious command, and what
`insertField` already did. Rejected on the measurement: it produces a document the
validator accepts, the engine renders differently from how the builder draws it, and
nothing anywhere reports the difference. This is the documented-but-inert failure mode in
a new costume.

**Refuse `addPage` on a form that has top-level fields**, and tell the author to move them
into a page first — which they cannot do, because there is no page to move them into. A
refusal whose remedy is impossible is a dead end wearing an error message.

**Make the validator refuse a field beside a page**, so the shape cannot exist at all.
Tempting, and rejected for now because it is a **spec change**: documents that validate
today would stop validating, and version 2 is frozen. It is the right long-term answer and
belongs in the discussion of a version 3, where it would be a migration with a report
rather than a silent breakage. Recorded in `SAFETY-ANALYSIS.md` as D8 with that residual
stated.

**A `page` entry in the palette, targeting only the top level.** Rejected in the comment
this record is finishing: the palette's contract is that its entries can go wherever
`validTargets` says, and one entry with a single legal home reads as a broken palette
rather than as a different kind of thing.
