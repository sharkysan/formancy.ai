# 0050 — Edit the arrangement in two places, over one document

- **Status:** accepted
- **Date:** 2026-09-21
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/builder-core/src/layout.test.ts` (36 cases,
  including the index arithmetic and the model-to-layout pruning),
  `packages/builder-react/src/layout-drop.test.ts` (13, both off-by-ones and
  the one that was a real bug), `layout-tree.test.ts` (13, the sentences a
  screen reader reads), `layout-pane.test.tsx` (28, every command by keyboard
  and then by drag), `arrange-surface.test.tsx` (11), and
  `apps/playground/src/app.test.tsx`, which is where the two views are checked
  against each other.

## Context

Layouts shipped renderable and unauthorable ([0047](0047-layouts-render.md)).
A form author could put two fields side by side only by editing
`schema.layouts` as JSON — and the question that surfaced it was the obvious
one: *how do I drag the rows and columns?*

Three problems had to be answered together.

**A layout node has no key.** A field is `contact.email` wherever it sits. A
row is "the second thing inside the third thing", and every insert or removal
renumbers its neighbours. Every address here is positional, and reading one
wrong is silent: you edit a different node and the document stays valid.

**The model tree cannot also be the layout tree.** The model says what the form
collects; the arrangement says where it appears. A field can be in the first
and absent from the second. One list showing both would have to pretend those
are the same question.

**Arranging on a tree beside the form is not how anyone thinks about layout.**
The thing being arranged is on screen, two panes over.

## Decision

**Two editors, one session.** A separate arrangement tree, and the preview
itself as a drop target. Both go through `session.moveLayoutNode`, the same
call the keyboard makes, so they cannot disagree — a drop edits the document,
the document rewrites the JSON, and the JSON rebuilds the preview.

**Keyboard first, again** ([0046](0046-keyboard-before-drag.md)). Every command
— add a row, column or section, place a field, move, unwrap, remove — works
from the arrangement tree with no pointer, and the move palette describes
destinations as sentences: *"Row with First name and Last name, between First
name and Last name"*. A container with no label is named by what it holds,
one level deep; naming it by its whole subtree produced "Section with Row with
First name and Last name and Email", where no reader can tell which "and"
separates what.

**The renderer knows nothing about the editor.** It emits
`data-formancy-layout-path` on every container and `data-formancy-field-path`
on every field, both inert, in React and Angular alike. The arrange surface
reads them from the outside and sets `draggable` on the DOM. Nothing in
`@formancy/react` imports anything from the builder, and a form in production
carries two attributes nobody reads. Putting editing hooks in the renderer
would have been the beginning of the renderer becoming an editor.

**`LayoutLocation.parent` addresses the document the caller can see; the index
counts positions after the lift.** Both halves are needed and they are not the
same frame of reference: the self-containment check compares two paths as they
stand, while a move index must account for the node being lifted out. The
session applies the container correction once, on the inside.

**An arrangement is a view of the model and cannot outlive it.** Deleting a
field removes it from every layout; renaming one repoints every layout at the
new path, including fields inside a renamed group. Without this both commands
are simply *refused* — a layout node pointing at a field that does not exist is
invalid — so a field could not be deleted or renamed at all once it had been
arranged. The emptied row stays: taking it away as a side effect of deleting a
field rearranges everything beside it, and nobody asked for that.

## Consequences

**What it buys.** Rows and columns can be built by anyone, with or without a
pointer, and the two views of the document are the same document. The fields an
arrangement leaves out are named in the pane, because a field the only layout
omits is collected by the form and invisible to everyone filling it in.

**What it costs.** Positional addressing, with the correction split across two
layers — stated in both places, and the reason the drop surface has a test per
off-by-one. Two attributes in every rendered form that only a builder reads.
And the arrange surface marks elements draggable by writing to the DOM, which
is a tool reaching into markup it does not own; it is confined to the builder's
own preview and reverts on unmount.

**What is not built.** No pointer gesture creates a row — you add one and move
fields into it. Dropping *between* two elements rather than onto one would need
gap targets the renderer does not emit. And moving a node between two layouts
is refused rather than supported: a field has one place per arrangement, so
moving it across would silently unplace it where it came from, which is a
deletion wearing the word "move".

## Alternatives considered

**One tree for the model and the arrangement.** Rejected: see above. It would
also have to invent an answer for a field in the model that the layout omits,
and every answer is a lie about one of the two documents.

**Dragging only on the preview.** Rejected. Nesting is invisible there — an
empty row and a row with one field look the same — and there is no way to reach
a container that renders as nothing.

**Editing hooks in the renderer.** Rejected: the project exists because the
markup belongs to the consumer. Two inert attributes is the smallest thing that
made an external tool possible.

**A drag library.** Rejected for now. The keyboard path is the requirement, the
drop model is forty lines and fully tested, and a library would bring its own
accessibility story to reconcile with ours.
