# 0233 — A host may add content of its own under a field, inside the field's wrapper

- **Status:** accepted
- **Date:** 2026-11-04
- **Deciders:** Daniel Bacher
- **Verified by:**
  - `packages/react/src/field-addition.test.tsx` and `packages/angular/src/field-addition.test.ts`,
    case for case: nothing drawn where the host gives nothing, each field's markup unchanged; the
    content as the last thing in the field's wrapper, after its error; in each of the four fieldset
    shells too; asked for by every drawn field's path, a row's field among them and no hidden one;
    the field's value read by the content, through `useField` in React and the binding the
    template is given in Angular; no role or name, and the control's `aria-describedby` as it was.
    Each failed before the renderer had the option. Broken one at a time, a case failed every
    time: in React, an empty wrapper drawn for nothing (two), the addition before the error (one),
    the matrix without it (two), a role on it (one), no provider (eight); in Angular, the same
    five (two, one, two, one, eight) and the template given no binding (three).
  - `apps/docs/src/themes.test.ts`, *every part the renderers emit is styled by every theme*: it
    failed for all four themes once the renderers emitted `field-addition`.
  - `apps/playground/src/two-renderers.test.tsx`, *what the playground, as a host, draws under a
    field*: the chosen pickup point under that field, in both renderers. It failed with the option
    taken off the React pane, and again off the Angular one.

## Context

Formancy Data's host page finds records, and a foreign key is a lookup field: a select whose
options come from a remote source, narrowed by typing. Under that field the host wants a short
summary of the record the answer points to, "Muster AG · Bahnhofstrasse 1, 8001 Zürich", and an
action that opens it elsewhere on the page. There was nowhere on the paper to put it. The host's
browser gate fails any rule of the host's own stylesheet that selects an element on the paper, and
no part a theme dresses was a host's addition to a field, so the summary sat in a strip above the
form.

React's `registry.byPath` replaces a field's whole component. A component that drew the built-in
one and its own content after it would put that content outside the field's wrapper, where a row
or column layout takes it for a cell of its own, and no theme dresses it.

## Decision

Each renderer takes `fieldAddition`, a function from a field's path to the host's content, or to
nothing: a React node in React, a template in Angular. What it gives is drawn as the last child of
the field's wrapper, after its label, description, control and error, in a
`data-formancy-part="field-addition"` that every theme dresses. Nothing is drawn, not even the
wrapper, where it gives nothing. In Angular the template is given the path and the field's binding.

## Consequences

**What it buys.** A host shows what an answer means where the answer is, inside the paper and
dressed by the theme, without styling the paper itself: each theme gives the addition a row of its
own in the field, and its links and buttons the theme's own link colour and quiet button. An empty
addition, the summary of a choice not made yet, takes no room.

**What it costs.** Five places in each renderer draw a field's wrapper, the shared shell and the
fieldsets of the radio group, the ticks, the matrix and the ranking, and each draws the addition;
a sixth shell would have to as well, and the case that lists the five is what would notice it
missing. The matrix and the ranking are fieldsets disabled with their field, so a host's control in
their addition is disabled with it. The two renderers hand the field to the content differently,
React by the hook every host component uses and Angular through the template's context, because a
component cannot inject a binding by a path that only arrives as its input. The function is called
for every drawn field on every render of that field, so a host keeps it cheap and constant. That
the addition takes a row of its own, and none when empty, is CSS the jsdom suites cannot see, and
the browser gate draws no addition: those two are held by nothing but the rules themselves.

**What it does not do.** It is no part of the document: a form says nothing about it, and the spec
and the engine are untouched. It draws nothing for a field that takes no answer, static text, nor
for a hidden one, which is not drawn at all. It adds no role, no name and no id, and describes no
control: the content is the host's, its links and buttons named by the host, and read as a
control's description it would be flattened into a single string.

## Alternatives considered

**A wrapping component in the registry.** Already possible in React, and rejected for the reasons
above: outside the wrapper, a layout's cell, and dressed by no theme.

**Name the addition in `aria-describedby`.** Rejected: a summary with a link and a button in it,
read out as the control's description, loses both, and the host can give its content the
relationship it wants.

**Before the error.** Rejected: the field's own parts would be split by the host's, and an error
read after the host's content is further from the control it is about.

**A host stylesheet allowed to select into the paper.** Rejected: the host's gate refuses such
rules for a reason of its own, that a theme is what dresses the paper, and the addition is a part
the themes can dress like any other.
