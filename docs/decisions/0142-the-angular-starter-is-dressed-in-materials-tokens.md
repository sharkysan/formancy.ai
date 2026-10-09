# 0142 — The Angular starter is dressed in Material's tokens, and loads the face they name

- **Status:** accepted
- **Date:** 2026-10-09
- **Extends:** [0133](0133-the-angular-starter-is-the-builder-and-the-form.md), the starter, and
  [0132](0132-material-draws-what-it-has-an-equivalent-for.md), whose adapter still ships no CSS
- **Deciders:** Daniel Bacher
- **Verified by:** `scripts/browser-test.mjs`, *the Angular starter* — Material's labels are
  drawn in a Roboto face the document loaded, the builder marks its selection in the colour
  `--mat-sys-primary` resolves to, and the submit button and a group's frame wear Material's
  primary and outline. All three were watched failing, with the font imports, the `--wb-signal`
  mapping and the submit and frame rules taken out: no Roboto face loaded while the label asked
  for Roboto, the selection marked in the workbench's own blue, the submit button the platform's
  grey. `apps/angular-starter/src/app/app.test.ts` — Save and Reload saved are Material's buttons
  (watched failing with the native ones). `packages/angular/material/src/controls.test.ts` — a
  group's frame carries the default group's hooks (watched failing: no `data-formancy-part`).

## Context

formancy.ai/angular-form-builder runs the starter, and it did not look like the Material
application the page says it is. Three causes, each measured in the running page rather than
read from the stylesheet:

- **Material's labels were in a serif.** The prebuilt theme's type tokens name `Roboto` with no
  fallback — `--mat-sys-body-large-font: Roboto` — and nothing loaded a Roboto face, so every
  machine without it installed drew the browser's default serif.
- **The builder had no styling at all.** It ships none, by design: a bulleted list of fields and
  a key legend as a bare definition list sat beside a Material form.
- **What Material does not draw was the platform's.** The submit button, a repeater's buttons and
  frame, the file field: formancy's default controls, which ship no styling either, so they were
  grey native buttons among Material's.

And one defect in the adapter, found while dressing them: the fieldset around Material's radios
and ticks is the adapter's own markup, and it carried none of the hooks the default group
carries. A stylesheet that reached the required hint in one registry missed it in the other, so
*required* stood as bare text before the radios.

## Decision

**The starter loads Roboto itself**, from `@fontsource/roboto` in its stylesheet, in the three
weights Material's tokens use — 400 for body, 500 for labels, 700 for headings — rather than
from a font service.

**The builder wears formancy's workbench, recoloured with Material's tokens.** Material has
nothing that draws a builder, so `@formancy/themes/workbench.css` dresses it, and the starter
maps each `--wb-*` token to a `--mat-sys-*` one. One theme decides every colour on the page.

**What Material does not draw is dressed in the starter's stylesheet**, in Material's tokens,
through the `data-formancy-part` hooks both registries emit — a filled button for submitting, an
outlined one for adding a row, text buttons for a row's own actions, a frame for a group. No rule
touches a control Material draws.

**The adapter's group frames carry the default group's hooks** — `field`, `label`,
`required-hint` and `data-state` — because the frame is the adapter's markup, not Material's.

**Save and Reload saved are Material's buttons.**

## Consequences

**The page looks like one application**, and a person copying the starter copies a Material page
rather than a Material form beside unstyled furniture.

**The starter's build carries every Roboto file a page could ask for.** 48 files, 656,144
bytes: every script subset, in WOFF2 and WOFF, in three weights. A browser fetches only the
subsets the page's text uses — measured on the starter, four files and 77,192 bytes — so the
cost is in the build's size, not in what a visitor downloads.

**The stylesheet is now a sample of dressing default controls**, about a hundred lines a host
owns and changes. It is not a contract: nothing in the published packages depends on it, and a
host using another design system writes its own against the same hooks.

**The workbench mapping depends on the workbench's token names.** If `--wb-signal` were renamed,
the mapping would silently set a variable nobody reads; the browser check catches it through the
selection's colour, and only through that one token — a renamed `--wb-rule` would leave the
builder's lines in the workbench's own grey, which nothing checks.

**Three facts are checked, not the look.** Screenshots are deliberately not a gate
([0102](0102-what-jsdom-cannot-see-is-checked-in-a-browser.md)): the check asks for a loaded face
and two colours, and a part dressed in the right colour but the wrong shape passes it.

## Alternatives considered

**A Google Fonts link, as `ng add @angular/material` writes.** One line, and what most Material
applications do. Rejected for the starter: every page a person builds from it would send its
visitors' addresses to a third party by default, and the browser check could only see the face
over the network, which is a check that answers differently wherever the network does.

**A Material stylesheet in `@formancy/themes`** for the default controls. Rejected: a published
stylesheet for one design system is a contract every other design system would then ask for,
and the adapter's rule is that it ships no CSS ([0132](0132-material-draws-what-it-has-an-equivalent-for.md)).

**Have the adapter draw the submit and repeater buttons with `MatButton`.** They are the form's
and the repeater's own buttons, not controls the registry resolves, so the registry would need a
slot for buttons that only this adapter fills. Possible later; not needed to stop the page
looking like two applications.

**Leave the builder unstyled**, since it ships no styling. It is the first thing on the left of
the page.
