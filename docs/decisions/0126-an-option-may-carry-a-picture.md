# 0126 — An option may carry a picture, shown only where it can be seen

- **Status:** accepted
- **Date:** 2026-10-09
- **Verified by:** `packages/spec/src/option-image.test.ts` — a picture may come from an
  `https://` address, a path on the same site or a `data:image/` address, and not from
  `http://`, a script, a protocol-relative address or a bare file name; it is refused on a
  dropdown and on a tag picker, and before version 4; and a picture changed between
  versions is reported as compatible. `option-image-source.test.ts` — the renderers' rule
  is the schema's pattern, read from the schema. `packages/react/src/option-image.test.tsx`
  and `packages/angular/src/option-image.test.ts` — the picture is inside the option's
  label, its text alternative joins the option's name a space apart, an absent one leaves
  it as decoration, and an address the format does not allow is not loaded.
  `packages/builder-core/src/properties.test.ts` and `editors.test.ts`, and both builders'
  panel tests — a picture is offered exactly where the document may carry one, and clearing
  its address takes it away. `apps/docs/src/themes.test.ts` — every theme styles
  `option-image`. Each was seen to fail with what it guards removed.
- **Deciders:** Daniel Bacher

## Context

The survey-controls item asked for image choices: a question answered by picking a picture —
which logo, which room layout, which of these is your bicycle. Every survey product has one.
The answer is still one of the options, so this is presentation; what needs deciding is
where a picture is stored, where it may be shown, and where it may come from.

## Decision

**A picture belongs to an option**: `image: { src, alt? }` on the option, beside its `value`
and `label`, spec version 4. The answer is the option's `value`, unchanged — the engine needs
nothing new, and a diff that changes only a picture is compatible
(`field.optionPictureChanged`). The option comparator reports it because nothing else would:
`options` is excluded from the residual backstop as a property the comparator accounts for.

**Shown only where it can be seen.** Radio buttons and checkboxes draw it; a dropdown cannot,
and a tag picker shows chips. A picture on either would validate and draw nothing — the
documented-but-inert failure — so the validator refuses it (`option.imageInDropdown`,
`option.imageInChips`) and the builder does not offer it. Both ask `optionImageRefusal` in
`@formancy/spec`, so the two cannot disagree.

**Inside the label, a space before the words.** Pressing the picture chooses the option, and
the text alternative joins the option's name: "A tabby asleep in the sun Cat". Without the
space the two run together — measured in both renderers — and in Angular the space is
`&ngsp;`, because Angular strips a plain one. Absent, `alt` is empty: the label already says
what the option is, and the picture is decoration.

**From three kinds of address, checked twice by one rule.** `https://…`, a path from the
showing site's root, or the picture itself as `data:image/…` (png, jpeg, gif, webp, avif,
svg) up to 64 KiB. Not `http://`, which a secure page blocks; not `//host/…`, which is another
site; not a script. The schema states the pattern; `isImageSource` in `@formancy/spec` is the
same pattern, held to it by a test that reads the schema; and both renderers ask it before
drawing, because the engine assumes a valid document and a host can hand a renderer one that
never met the validator.

**Every theme draws it**, each in its own language — a framed figure, a lit inset, a sticker,
a plate — at one fixed shape, so a row of pictures lines up whatever their proportions.

## Consequences

**A picture on another site tells that site who opened the form.** Loading it sends the
person's address and browser to whoever serves it, before they have answered anything. The
format cannot prevent that and does not try; it allows the two alternatives that tell nobody
— a path on the showing site, and a picture the document carries — and says so in the
schema's own description of the field.

**A document can carry pictures, and grows with them.** 64 KiB per picture is a cap, not an
encouragement: every published version is stored for good and hashed whole. The starter's two
pictures are a few hundred bytes of SVG.

**A host with a strict Content Security Policy needs `img-src`** to allow `data:` for pictures
a document carries, and the hosts it names for the others. The SOUP declaration says so.

**Angular's sanitizer was not the reason for the shared check.** It was assumed to rewrite an
SVG `data:` address as `unsafe:`, and a bypass was written for it; measured, Angular 22
refuses `javascript:` and nothing else, so the bypass — and the dependency on
`@angular/platform-browser` it would have added — was removed before this shipped.

**The rule vocabulary left `types.ts`** for `rules.ts`, the way the layout vocabulary left for
`layout.ts`: the option's picture would not fit under that file's size ceiling, and how a form
behaves changes for its own reasons. `types.ts` is under the budget now and off the list; the
playground's starter gave its three catalogues to `starter-messages.ts` for the same reason.

## Alternatives considered

**A widget, `imagepicker`.** The picture is content, one per option, not a way of drawing the
field; a widget would still need the pictures somewhere, and they belong with the option they
picture.

**Pictures on a dropdown, drawn by a custom listbox.** A different control from the platform
`<select>` every renderer uses, for a case radio buttons already serve.

**Only `https://` addresses.** Every picture would then tell a third party who opened the form,
and a form moved between deployments would lose its pictures with the host.

**No `data:` addresses, to keep documents small.** The same cost, and the cap answers the size
concern without it.
