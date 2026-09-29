# @formancy/builder-angular

The form builder's structure editor, for Angular. Drives
[`@formancy/builder-core`](../builder-core), which holds the document, the undo
stack, the rules about what edits are legal, and — since this package exists —
everything the two builders read off a session.

```ts
import { Component } from '@angular/core'
import { createBuilderSession } from '@formancy/builder-core'
import { FormancyBuilder } from '@formancy/builder-angular'

@Component({
  imports: [FormancyBuilder],
  template: `<formancy-builder [session]="session" (selected)="chosen.set($event)" />`,
})
export class Editor {
  protected readonly session = createBuilderSession(schema)
}
```

Angular **22**, and **zoneless**: it never touches `zone.js`, never calls
`ChangeDetectorRef`, and never re-renders because something elsewhere changed.
The session is read through one signal that changes exactly once per accepted
command, so a keystroke the session refuses costs no render at all.

## It is the same builder, not a second one

The parts that decide anything live in `@formancy/builder-core` and are shared
with [`@formancy/builder-react`](../builder-react): which destinations a field
may move to and how each is described in words, which types the document's spec
version allows, what a structured condition compiles to in CEL, where a drop
lands. Two builders offering different destinations for one document would be
two products, and nobody using only one of them could see the difference.

What is per framework is the components. This package's job is to turn a session
into signals and a signal into markup.

## It is a keyboard interface first

Both builders were built that way and the order is the point: WCAG 2.2 SC 2.5.7
requires every dragging movement to have a non-dragging alternative that does the
same job, and built the other way round the drag ships while the keyboard path
becomes a follow-up competing with features.

| Key | What it does |
|---|---|
| `↑` `↓` | Move between fields, in the order a person reading the form meets them |
| `Home` `End` | First and last field |
| `a` | Add a field — asks what, then where |
| `m` | Move the focused field — opens a list of destinations |
| `p` | Add a page, making the form a wizard |
| `u` | Take a container away and keep what is inside |
| `Delete` | Remove it |
| `Ctrl+Z` / `Ctrl+Y` | Undo / redo |

The tree is **one tab stop**, not one per field: a hundred-field form should not
cost a hundred tabs to get past, so a roving `tabindex` gives exactly one item
the tab order and the arrows do the rest. Every destination is a sentence —
*"inside Billing address, after Street"* — rather than an index, because a
palette reading "0, 1, 2" is a keyboard route only in the sense that it exists.

Every command reports through one polite live region. `role="status"` already
implies `aria-live="polite"`; setting both is the classic way to hear it twice.

## What it does not have yet

The arrangement tree, the property panel, the condition editor, the translations
pane and the drag surfaces are React-only for now. `@formancy/builder-core`
holds what each of them needs, so they are components rather than designs.

## Licence

Apache-2.0.
