# 0070 — A code is an arrangement, not a field

> **Partly reversed: a code node now draws a code.** This record argued that shipping no
> encoder was the right trade, and the argument was about cost rather than about value —
> which meant it lost the moment a visible code was asked for. `uqr` is MIT, has no
> dependencies, is 6.6 kB brotli, and the build leaves it external so a consumer without a
> code node pays nothing for it in their bundle.
>
> What survives unchanged is the part that was never about the encoder: **the picture is
> decoration and the value is the content.** The SVG is `aria-hidden` and the value stays on
> the page as real text, because a picture of a code says nothing to a screen reader and an
> `alt` of "QR code" says nothing either. And the drawing is built from the encoder's matrix
> rather than with its own `renderSVG`, which emits `fill="white"` and `fill="black"` — a
> renderer choosing colours is what [0004](0004-headless-core.md) exists to prevent.
>
> The mechanism decision — a layout node rather than a field type or a widget — is
> untouched, and is what the rest of this record is about.

> **The accessible content was right and it was not attached.** This record says the value
> is the accessible content, not the picture — and both renderers put the label in a loose
> `<span>` beside the value rather than naming it. Measured with a real accessible-name
> implementation, `computeAccessibleName` of the `<output>` holding the value was the
> **empty string**, so a screen reader announced a booking reference with nothing to say
> what it was. Reported by somebody looking at the running playground.
>
> It matters more here than a loose caption elsewhere: `<output>` is a live region, so the
> text is announced whenever the answer changes, and an unnamed live region reads a value
> out of nowhere. The label now carries an id and the value points at it, in both
> renderers, asserted with `computeAccessibleName` in each and shown to fail by removing
> the association. `apps/playground/src/accessible.test.tsx` catches it too, which is the
> guard that did not exist when this shipped.
>
> The decision is untouched. The value is still the content and the picture is still
> `aria-hidden`.

- **Status:** accepted
- **Date:** 2026-09-27
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/spec/src/qrcode.test.ts` (9 cases: the leaf-kind list and
  `layoutChildren`, the node validating, a path that names nothing refused, children
  refused, the version 1 gate by name, and an assertion that the model gains no field).
  `packages/react/src/new-types.test.tsx` and `packages/angular/src/new-types.test.ts`
  (4 and 3 cases: the value shown as text, one control on the page rather than two, the
  empty/ready state, and in React that a code alone does not count as placing the field).
  Removing `qrcode` from `LAYOUT_LEAF_KINDS` fails the first file; making the renderers
  read the snapshot without subscribing fails the state cases, which is how that bug was
  found in both.

## Context

A form that collects a booking reference often wants to show it back as a scannable code.
The request arrived as a field type, and it is two requests wearing one name: **showing** a
code writes nothing, and **scanning** one writes an answer.

The scanning half is already settled — it is `widget: "scanner"` on a text field
([0065](0065-a-widget-is-authored-not-registered.md)), because it produces a string a
person could otherwise type. This record is about the other half.

## Decision

**A `qrcode` layout node, and not a field type or a widget.**

**Not a field type, because it collects nothing.** A field type would put a non-answering
entry in the model: a `key` that is an identity forever, a path in the data, a row in every
`diffSchemas` result, a column in an exported CSV nobody ever filled in, and a target a
computed rule could aim at. `static` is the precedent for paying that, and it is not one to
follow — `static` predates the `layouts` section, so it is history rather than a pattern.

**Not a widget, for the opposite reason to the scanner.** A widget sits on a field that
collects. `widget: "qrcode"` on a text field would replace the input with a picture, which
changes what somebody may enter — over the line 0065 draws, and that line is the whole
value of the widget mechanism.

A layout node needs no field to hang off, already addresses answers by data path, already
validates that the path exists, and already means "a presentation of the model rather than
part of it".

**It is not a placement.** `placedPaths` deliberately ignores it: a code is a second *view*
of an answer that a field node places elsewhere. Counting it would report a field as placed
when no control for it exists — a form with an answer nobody can give. For the same reason
it is exempt from the one-place-per-field rule, so showing a reference as a field *and* as
a code is doing what the author meant.

**In the builder, a code follows a rename and goes with a deletion.** A declared rename
keeps the answer, so a code of it must keep encoding the same answer; leaving the old path
behind would turn a rename into a silently broken code. And a code whose answer is deleted
would draw a picture of nothing, which the validator would then refuse in a document the
builder had just produced.

## Consequences

**The union's two-shape assumption had to be named, and that is most of this change.**
`LayoutNode` has had exactly two shapes: `field`, with a path and no children, and
everything else, with children. **Fourteen** places encoded that as
`node.kind === 'field' ? … : node.children`, and `isLayoutContainer` in
`@formancy/builder-core` stated it outright as `node.kind !== 'field'`.

`qrcode` is the first childless node that is not a field, so all fourteen were about to be
wrong. The compiler caught most of them, which is the good case; `validate.ts` and
`presentation.ts` instead walked into `undefined` at runtime, which is not.

So the assumption now lives once, in `@formancy/spec`, as `LAYOUT_LEAF_KINDS` and
`layoutChildren(node)`. Every site reads the helper rather than testing the kind, and the
next childless node is a one-line change. That refactor is the only reason it belongs in the
same commit as the feature: shipping the node without it would leave thirteen latent
`undefined` reads for somebody else to find.

~~**There is no QR encoder, and the renderers say so by showing the value.**~~ **Reversed;
see the note at the top.** The cost was real and was priced correctly — an encoder is a
dependency, and one that draws something a design system may want to draw itself. What this
paragraph got wrong was treating that as decisive: a code node that shows no code is a
feature named after something it does not do, and the whole point of the construct is that
somebody can scan it.

Measured rather than estimated, which is what changed the answer: `uqr` is 6.6 kB brotli,
not the ~10 kB this paragraph guessed, has **no dependencies**, and is left external by the
build — so the barrel grew 0.4 kB for the drawing component and a consumer with no code node
pays nothing. The registry still replaces the drawing for anybody who wants their own.

**The accessible content is the value, not the picture**, and that is not a workaround for
the missing encoder — it is the correct design either way. A picture of a code says nothing
to a screen reader, and an `alt` of "QR code" says nothing either. What somebody needs is
the value, which they can read, copy or dictate.

**The same bug was written twice and caught twice.** Both renderers first read
`engine.getFieldSnapshot(...)` directly, which renders the value once and never again — in
React because nothing subscribed, in Angular because a plain method call is not a signal an
OnPush component re-runs for. Measured in both: the node stayed `data-state="empty"` after
the answer was typed. A code is a live view of an answer and has to subscribe like any other
reader of one.

## Alternatives considered

**A field type with a `source` property naming another field.** Rejected twice over: it
takes the model cost above, and the model has no cross-field references at all — references
live in `logic` as CEL and in `layouts` as data paths. Inventing a third place for one
construct would be the expensive half of a design nobody else needs.

**Reusing `static`.** `static` shows text and collects nothing, which is the same shape.
Rejected because its text is a literal in the document, not a view of an answer, and giving
it a path would make one type mean two things.

**One `qrcode` construct covering both showing and scanning, with a flag.** Rejected: one
construct with two value shapes (nothing, and a string), two accessibility stories, and two
mechanisms — a flag would hide that they are unrelated features that share a word.

**Shipping the node and deferring the renderers.** Rejected on the same grounds as the
temporal types: a construct no renderer handles renders nothing, which is
[0051](0051-spec-2-adds-types.md)'s silent failure in a new place.

**A QR encoder behind an optional peer dependency.** Worth revisiting, and rejected for now
because an optional dependency that most consumers do not install is a feature most
consumers do not have, described as though they did. The registry route gives the same
result with nothing to declare.
