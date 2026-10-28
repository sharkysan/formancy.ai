# 0213 — A host can take a person to a question, by the function the summary and the review use

- **Status:** accepted
- **Date:** 2026-10-28
- **Deciders:** Daniel Bacher
- **Decides:** the way to a field that [0186](0186-a-fields-control-id-names-its-group-or-its-control.md)
  left unexported, "a separate decision about the packages' API"
- **Verified by:**
  - **`packages/react/src/go-to-field.test.tsx` and `packages/angular/src/go-to-field.test.ts`**, by
    the same case names: a host's own button calling `useGoToField()` / `injectGoToField()` with a
    path moves a paged form to the question's page and focuses it, lands on a radio group's first
    option, and reaches a field in a repeater's second row — each failed before the function
    existed, and in React a version that did not move the page failed the first and one that called
    `focus()` on the element failed the second. A fourth case holds that a path no field has
    throws; it was written after the function and passed at once, since the throw is the engine's.
  - **Each renderer's error summary and review tests**, *summary-across-pages* and the review's
    Change, unchanged, now passing through the same function.

## Context

The engine gives every field a control id, and the renderers put it where focus can go: on the
control, or on a group's fieldset, which takes no focus (0186). Taking a person to a question then
takes three steps the renderers knew and a host did not: move a paged form to the question's page,
wait for that page to be drawn, and focus into the element — its first control when it is a group,
after telling a layout to open the tab it sits behind. `focusControl` does the last; the error
summary did all three (0205), and the review's Change did them again with its own state and effect
(0204). Neither was exported, so a host with a list of its own — what is still missing, a "jump to
the signature" button — focusing by `ids.control` reached nothing for a group, and nothing for a
question on another page.

## Decision

`useGoToField()` in `@formancy/react` and `injectGoToField()` in `@formancy/angular` return a
function that takes a field's path and does all three. The error summary's links and the review's
Change call it, so there is one implementation per renderer and the host gets the same one. In
Angular it focuses at once when the field is on the page and drawn, and after the next render
otherwise, since a call from outside Angular schedules no render.

## Consequences

A host can offer "go to this question" without knowing how a form is paged or which element holds
the focus.

**What it costs.** Two exported names, which are API from the next release: the path's shape, the
behaviour on a paged form and what "focused" means are now promises. And it is a function per
renderer, each with its own way of waiting for a render — React's effect after a commit, Angular's
`afterNextRender` — held to the same cases by name.

**What it does not do.**

- **A path no field has throws** — `Unknown field` — as the engine does for one, rather than
  doing nothing quietly: a host's link that goes nowhere is a bug to find, not a click to ignore.
- **It moves the wizard by `goTo`**, which does not validate, as the summary's links always have:
  it is a way to a question, never a way past a page's checks.
- **`focusControl` and the `formancy-reveal` event stay unexported.** The function takes a path, so
  a host never needs the element.

## Alternatives considered

- **Export `focusControl`.** What 0186's debt row asked for, and not enough: it takes an element,
  so a host would still have to move the page and wait for it to be drawn, which is the part the
  summary got wrong until 0205.
- **A method on the engine.** The engine runs on the server and has no DOM; focus belongs to the
  renderer that drew the page.
