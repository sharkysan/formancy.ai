# 0083 — A signature is points, or a name

- **Status:** accepted
- **Date:** 2026-09-29
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/core/src/signature-validators.test.ts` — seven cases over the
  answer's shape, each observed failing before the rules existed — and
  `packages/core/src/signature.engine.test.ts` for what counts as signed.
  `packages/react/src/signature.test.tsx` and the signature block in
  `packages/angular/src/new-types.test.ts` assert the same behaviour in both renderers by
  role and accessible name. `apps/docs/src/themes.test.ts` fails when any appearance does
  not dress the four new parts, and `apps/playground/src/starter.test.ts` fails when the
  demo does not use the type.

## Context

`signature` is the last of the three components form.io and FormEngine both charge for,
and the only one still unbuilt: `datagrid` shipped as a widget over the repeater's
existing data model, `qrcode` split into a layout node and a scanner widget. It is a new
**field type**, so it is a new spec version — a reader that has never heard of it renders
nothing, collects nothing and drops the answer, which looks exactly like a field somebody
left blank ([0051](0051-spec-2-adds-types.md)).

Three questions had to be answered before any of it could be written.

**What is stored?** The obvious answer is a picture, and every implementation that gives
it regrets it: a PNG in a submission is a megabyte of base64 nobody can read, it does not
scale, it cannot be diffed against the previous answer, and it means nothing to a reader
that is not a browser.

**How does somebody sign without a pointer?** A drawing surface is unreachable from a
keyboard by construction. "Sign here" is also usually the one question on a form that is
not optional, so a field that offered drawing alone would be a WCAG 2.1.1 failure with a
legal signature attached to it.

**How much of the signing is captured?** Stroke timing is what commercial e-signature
products capture and sell as forensic evidence. It is also what makes a signature
**biometric data** under GDPR Article 9 — a special category with its own lawful bases,
its own retention questions and its own breach consequences.

## Decision

**A signature answer is points, or a name, and never both.**

```jsonc
{ "drawn": [[[12, 40], [13, 41], [20, 55]]] }   // a mark, as strokes of points
{ "typed": "Mara Lindqvist" }                   // a name
```

**Points, because points do what a picture cannot.** They scale to any size, diff against
the previous answer, survive a re-render, and can be drawn by anything that can draw a
line. The control draws them as an SVG path, which costs nothing extra and makes the mark
visible to anything that can read the DOM — including a test.

**Whole numbers, in the field's own `box`.** A submission is bound to a canonical hash, and
that hash must not depend on how one browser rounded a pointer event. The box is
`[width, height]` and belongs to the **field**, not to each answer: a point at `x: 300`
means nothing without the width it was drawn in, and a box per field is what makes two
signatures on one form comparable.

**Typing is the second route and not a lesser one.** It is how most people sign most
things, and it is the only route a keyboard has. Both routes write the same field, the
last one used wins, and the two are never both present — a reader choosing between them
would be a signed document that renders differently depending on the choice.

**No timing, and this is a refusal rather than an omission.** Capturing velocity would
make every submission holding a signature a store of biometric data, and nothing in this
product — not the schema, not the audit log, not the retention model — is equipped for
that. A signature here is a mark somebody made, not evidence about their body.

**Bounded by `maxPoints`.** It is the one answer whose value is an unbounded nested array,
which makes it a payload question before it is a drawing one.

## Consequences

**Spec version 3 is open**, and the version gate had to be generalised to open it. It read
`if (specVersion !== '1') return []`, which was right while there were two versions and
silently wrong the moment there was a third — a `richtext` in a version 1 document would
have been waved through by a function that had stopped looking. Each construct now names
the version it arrived in and the comparison is against the document's own.

**The builder offers one version step at a time.** Its upgrade button said "Move it to
version 2" as a literal and called `upgradeSpec()` with no argument, which after this
would have moved a version 1 document straight to 3 — costing it every reader pinned to 2,
for a type that only needs 2.

**A signature cannot be verified by this software, and nothing here claims otherwise.**
What is stored is what somebody drew or typed in a browser that said it was them. There is
no identity proof, no certificate, no timestamp authority and no tamper-evident envelope
beyond the submission's own schema hash. A manufacturer who needs a qualified electronic
signature under eIDAS needs a qualified provider, and this is a mark on a form.

**Four new parts for a theme to dress**, and an unstyled drawing surface is an invisible
field — an empty SVG collapses to nothing, which is how the rich-text editor once shipped
invisible. Every appearance gives the surface a height of its own.

**No pressure, no pen width, no colour.** Appearance belongs to the consumer's design
system ([0008](0008-layered-packages.md)), and a stroke width stored in the answer would
be appearance in the data.

## Alternatives considered

**Store an SVG path string** rather than an array of points, e.g. `"M12 40 L13 41"`. More
compact and directly renderable. Rejected because it is markup in a submission: a reader
has to parse it to do anything but draw it, and a path string is a small language with a
grammar somebody will eventually put something else into. Points are data.

**Store a PNG data URI**, which is what most implementations do. Rejected on every count
above, and on one more: it would put an image decoder in the path of displaying a
submission, in a product that deliberately never renders a submitted answer as markup.

**Capture timing and offer it as an option.** Rejected because an option is not a defence:
a deployment that switches it on has acquired biometric obligations it may not know about,
and the property would exist in the format for everybody. A product that cannot hold the
data safely should not offer to collect it.

**A `signature` widget on a `text` field** rather than a type, which would have avoided
the version bump. Rejected because the answer is not a string: a widget changes how a
field *looks*, never what it *stores*, and that line is the whole reason widgets are
affordable ([0066](0066-a-widget-may-be-configured.md)).

**Require the typed name as well as the mark**, as some e-sign flows do. Rejected as an
authoring decision rather than a format one: an author who wants both can add a text field
beside the signature, and forcing it would make the common case worse for everybody.
