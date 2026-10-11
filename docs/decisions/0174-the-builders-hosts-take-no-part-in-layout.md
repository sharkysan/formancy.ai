# 0174 — The builder's hosts take no part in layout, and the two builders are measured part by part

- **Status:** accepted
- **Date:** 2026-10-11
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/builder-angular/src/host.test.ts` finds every component the package
  can draw, from its exports through each component's compiled imports, which reaches the
  twenty with an element of their own, internal ones included. It asserts that each host
  computes `display: contents` and that no injected `<style>` is what says so. All twenty failed
  before the change, each computing `block`. The stylesheet case failed with
  `formancy-translation-review` given `:host { display: contents }` as a component style. It
  had first passed with that style in place, because Angular takes a component's `<style>` out
  again when its last instance is destroyed, so it now reads the document with every instance
  alive. `scripts/builders-layout-browser-test.mjs`, in `pnpm test:browser`, opens five views of
  the starter in both builders at 1440×1000 and finds every builder part in the same place, to
  the pixel. The five are Fields with a choice field selected, Arrangement with a row selected,
  Rules, and Translations on the default language and in French. Run against formancy.ai as
  deployed before this change, it failed four of them: the field tree and the layout node's
  panel 14px higher in Angular, and the translation table in the narrow column in both
  Translations views. Against a build with only the options heading still an `<h3>`, it failed
  on the 13px above "Choices".

## Context

A visitor switching the playground to the Angular builder found its layout broken. Three
differences, measured in Chromium against the React builder on the same document:

| Where | React | Angular |
|---|---|---|
| Translations, default language | the table in the wide column, the preview beside it | an empty first cell, the table in the narrow column (168px of 411), the preview moved under it |
| Translations, French | the model's review across the pane | the review squeezed into the first cell, 227px |
| Fields, under the prompt box; Arrangement, above the node's panel | 14px of the pane's gap | none |
| The options editor's "Choices" | a `div` | an `h3`, with the browser's 13px above it |

The first two were [0073](0073-a-host-element-is-not-a-layout.md)'s bug in the builder. The
translations pane is a two-column grid in the workbench theme, and `formancy-translation-review`,
Angular's element for the model's review, was one of its items. On the default language it
draws nothing, and it still took a cell. The React review is no element at all until it draws
something, and what it draws spans the pane. The renderer's host elements had been taken out of
layout two weeks earlier ([0079](0079-a-host-is-undone-without-a-stylesheet.md)). No builder
host ever was.

The third was the same thing one level up, in the playground. The React builder's panes are
grid items of `.builder-pane` and are spaced by its gap. The Angular builder was one item,
holding every pane in normal flow, so the gap was gone. One margin on the lists of suggestions
stood in for it, which covered the suggestions and nothing else. The fourth was a template
written differently, which #169 had meant to make "one shape" and had not.

None of it could fail a test. jsdom performs no layout. The parity test in the playground
compares the set of part names each builder draws, and both drew the same parts. The
suggestions check measured two anchors, and both were above the difference.

## Decision

**Every component in `@formancy/builder-angular` with an element of its own takes it out of
layout**, as the renderer does: `display: contents`, set through CSSOM in the constructor,
which no CSP directive governs. One function, `takeHostOutOfLayout()`, is called first in each
constructor, and its comment carries the reason once.

**The playground's own wrappers do the same, in its stylesheet:** the pane it mounts Angular
into, the element Angular bootstraps into and the element each list of suggestions is drawn in.
The Angular builder's panes are then grid items of `.builder-pane`, as the React builder's
are. The margins that stood in for the gap are gone.

**The Angular options editor labels its list with a `div`**, as the React one does and as both
columns editors do.

**And the two builders are measured against each other in a browser, part by part.** Each part
is found by its `data-formancy-part`, and its box relative to the builder pane is compared, so
the next difference of this kind fails a gate. It stops at the form inside a translation
preview, which is drawn by a different renderer in each builder and compared by the renderers'
own suite. There the preview's place and width are compared, and not its height.

## Consequences

**A stylesheet that gave a `formancy-*` element of the Angular builder a box no longer can**:
a margin, a border or a grid placement on `formancy-builder` applies to nothing. An element
style beats every rule that is not `!important`. That is the cost 0079 named for the renderer,
paid again for the builder. A consumer styles the part inside, `[data-formancy-part='builder']`,
which is what a stylesheet for the React builder has always had to do.

**The elements leave the accessibility tree.** That is correct, because none has a role or a
name. The options editor's "Choices" is no longer a heading in Angular, and it never was in
React. The list is still named by it through `aria-labelledby`.

**What is verified is five views of one form at one width.** A pane drawn only in some other
state, such as a drafting run or a block being saved, is held by the host test to take no part
in layout, but nothing measures it against React in a browser. The measurement is relative to
the pane, so it cannot see a difference that moves the whole builder.

**The browser gate takes longer.** Each of the five views opens the playground twice and waits
for two identical readings in each builder.

## Alternatives considered

**A host directive, `hostDirectives: [HostTakesNoBox]`.** This is the composition API's way to
give twenty components one behaviour, and it was written first. ng-packagr refused it: a host
directive is in the published metadata of every exported component it is on, so it must be
exported from the package too (NG3001). That would make it public API for something no consumer
should call.

**A theme rule, `formancy-builder, formancy-translation-review, … { display: contents }`.**
Rejected for 0073's reason. It puts the framework's element names into every stylesheet, and it
does nothing for a consumer who dresses the builder in their own design system.

**Only the translation review.** It is the one host that broke the theme's grid, and the
smallest change. Rejected because the same failure is waiting in every other host, and a part's
parent is a theme's choice. A theme that lays the property panel out as a grid would meet it in
`formancy-property` next. The whole class costs one line per component.

**The margins, extended to every pane.** That is the way the suggestions were fixed. Rejected
because each pane needs its own rule, every rule copies the gap's value, and each one works only
until the next pane arrives without one.

**Comparing the markup in jsdom instead.** The parity test could compare each part's element
type as well as its name, which would have caught the `h3`. It would not have caught the first
three, because those are not in the markup. A layout difference needs a browser, and the browser
check also catches a different element if it is drawn differently.
