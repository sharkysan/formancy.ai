# 0137 — A paged form's layout is drawn a page at a time

- **Status:** accepted
- **Date:** 2026-10-09
- **Deciders:** Daniel Bacher
- **Verified by:** the conformance fixture *a paged form drawn with a layout shows the page
  somebody is on, as the layout arranges it* (`packages/conformance/fixtures/wizard-with-layout.json`),
  run by both renderers' drivers — React failed it by showing the second page's fields on the
  first, Angular by showing a field the layout leaves out. `packages/spec/src/layout.test.ts`
  — which nodes have anything to show. `packages/react/src/layout.test.tsx` and
  `packages/angular/src/layout.test.ts` — a tab strip offers only the tabs with something on
  the page. `packages/conformance/src/validate.test.ts` — a fixture naming a layout the
  document lacks is refused. Each was watched failing with its half of the change removed.

## Context

A form may have pages and a layout. Pages are steps — what Next checks and where a person is;
a layout is an arrangement — sections, rows, tables, tabs. Nothing said what a renderer does
with both, and the two renderers each decided:

- **React drew the whole layout on every step.** The layout branch never looked at the page,
  so the second page's questions were on the first — answerable, and not checked by Next.
- **Angular dropped the layout.** A paged form drew each page in model order, so a field the
  layout leaves out appeared, and the arrangement its author made was gone.

Neither was caught, because the conformance suite never mounted a layout at all: no fixture
could name one, and both drivers drew model order. It was found by reading the React form
while deciding whether a template could be a wizard.

## Decision

**A paged form's layout is drawn a page at a time.** Each step is the layout holding that
page's fields: a node shows while anything inside it is on the page, so a section, a row or
a table with nothing on this page is not drawn, and a tab with nothing on it is not offered.
A field the layout leaves out stays out on every page, as it does without pages.

**The question is answered once.** `layoutNodeShows(node, shows)` in `@formancy/spec` says
whether a node has anything to show; both renderers ask it with "is this answer on the
current page". A node it rules out is skipped **in place**, keeping its position, so the
index paths on the drawn elements stay the authored layout's — the builder's drop surface
reads them to know which node it is over.

**The conformance suite can mount a layout.** A fixture names one with `layout`, the drivers
pass it to the form, and the validator refuses a name the document does not have, for the
reason it refuses a locale with no catalogue: the renderer would fall back to model order and
the case would pass asserting nothing.

## Consequences

**A layout drawn per page can look sparser than the author pictured.** A section split across
two pages draws on both, each time holding only that page's fields; nothing merges or warns.
Where a section belongs on one page, its fields should be on that page.

**A third-party driver must now honour `layout`.** The shipped fixture asks for one, so a
driver that ignores it fails it — the intended effect, and a change for anybody certifying a
renderer against the published suite.

**The conformance page had gone stale.** It said "Six cases" while eleven shipped; it lists
them now, and `apps/docs/src/conformance-doc.test.ts` holds the table to the directory.

## Alternatives considered

**Refuse a layout on a paged form.** A validation change to frozen spec versions, which a
reader contract does not allow, and it would discard arrangements that are reasonable.

**Prune the layout tree and render the result.** Simpler in each renderer, and it renumbers
every node after a removed one — the drop surface would then move the wrong node.

**Pages win, as Angular did.** It makes a layout meaningless the moment a form gains a page,
which no author would guess.
