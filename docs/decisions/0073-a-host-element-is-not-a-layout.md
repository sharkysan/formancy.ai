# 0073 — A host element is not a layout

- **Status:** accepted
- **Date:** 2026-09-27
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/angular/src/layout.test.ts` (2 cases: every `formancy-layout`
  computes `display: contents`, and every element between a table and a cell inside it
  takes no part in layout). Removing the declaration fails both, observed — jsdom applies
  a component's own styles, which is the one thing about this it *can* see. What it cannot
  see is the layout itself, and that is the subject below.

## Context

Angular gives every component a host element. `FormancyLayout` recurses — a container
renders its children by rendering itself again — so a container's children arrive wrapped
in a `<formancy-layout>` element that React does not emit.

A theme lays a table layout out with `display: grid` and a column count. The grid's items
are its **children**. In React those children are the fields; in Angular they are one
`<formancy-layout>` holding all of them.

**So a two-column table layout has never produced two columns in Angular.** Measured in a
browser, both renderers' exact markup on one page against `blueprint.css`:

| | React | Angular |
|---|---|---|
| two fields side by side | yes — same top, 442px apart | **no** — 86px apart, same left edge |
| the grid's own tracks | `426px 426px` | `426px 426px` |
| element between grid and fields | none | `formancy-layout`, `display: block` |

The tracks were right in both. Only one renderer had anything to put in them.

**Nothing failed, and nothing could have.** jsdom has no layout, so a renderer test cannot
see where a box lands; the conformance suite queries by role and accessible name, which
were correct; axe had nothing to report, because nothing was inaccessible. And **no
application in this repository renders the Angular bindings** — the playground and the
admin app are React, and the docs only quote Angular. It was invisible from every angle
this project checks.

## Decision

**`:host { display: contents }` on the recursing component, shipped from
`@formancy/angular`.**

The element is removed from the box tree and its children take its place, so the
consumer's grid sees what it sees in React. It leaves the accessibility tree too, which is
correct: the element has no role and names nothing.

**This amends [0008](0008-layered-packages.md)'s "nothing below the component kit ships a
CSS file",** and the amendment is narrow: that rule is about who owns **appearance**. This
declaration owns none. It does not choose a colour, a spacing or a font; it undoes an
element the framework forced the renderer to emit, so that the consumer's own CSS behaves
the same against both renderers. A renderer that leaks its framework's artefacts into the
consumer's layout has not delivered "the markup belongs to your design system".

## Consequences

**Angular injects component styles as a `<style>` element**, so a deployment running a
strict `style-src` needs Angular's `ngCspNonce`. That is a real cost and it is the first
time this repository has one. It is the smaller cost: the alternative was a layout that is
wrong everywhere, including under a permissive CSP.

**A guard that sees the declaration, not the layout.** jsdom applies component styles, so
the test asserts the computed `display` and that every element between a container and a
cell inside it is `contents`. That is the one link in the chain a test can hold. The rest
of the chain — that `display: contents` makes a grid see the children — is CSS, and it was
measured in a browser rather than asserted here.

**The class of bug is the point, and this is the second one this week.** The typeahead
popup opened over its own label because `top: auto` means something different inside a
grid ([0072](0072-a-typeahead-is-a-combobox-over-the-same-answer.md)). Both were CSS
assumptions, both were invisible to every gate, and both were found by a person looking at
a running page. **There is no gate for "what it looks like", and the honest thing is to
say so** rather than to add a test that cannot see it. Listed as debt in
[§11](../architecture/11-risks-and-debt.md).

**An Angular application in this repository would have caught it.** That is the real
remedy and it is not in this change. Until one exists, the Angular bindings are verified
by markup and by conformance, never by rendering.

## Alternatives considered

**A theme rule, `formancy-layout { display: contents }`.** Rejected: it puts a
framework-specific element name into every consumer's stylesheet, and it cannot help the
consumer who styles their own design system and never reads our themes — which is the
consumer this project is built for.

**`host: { style: 'display: contents' }`.** The same effect through an inline style
attribute. Rejected because an inline style is *worse* under a strict CSP than a
stylesheet: `style-src` with a nonce covers the `<style>` Angular emits, while a style
attribute needs `'unsafe-inline'` or `'unsafe-hashes'`.

**Removing the wrapper: recursing through a self-referencing `ng-template` instead of a
child component.** The structurally correct answer, and it ships no CSS at all. Rejected
for now on risk rather than on merit — it is a rewrite of the layout renderer's control
flow to fix a one-line problem, and the component holds injected state the template would
have to thread through. **Worth revisiting**, and the guard above keeps working if it
happens.

**Leaving it and documenting that Angular does not do grid layouts.** Rejected as the
worst of both: it is the divergence [0033](0033-one-suite-n-drivers.md) exists to prevent,
written down as though it were a decision.
