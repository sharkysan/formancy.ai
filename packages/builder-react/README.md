# @formancy/builder-react

The form builder's structure editor, for React. Drives
[`@formancy/builder-core`](../builder-core), which holds the document, the
undo stack and the rules about what edits are legal.

```tsx
import { createBuilderSession } from '@formancy/builder-core'
import { FormancyBuilder } from '@formancy/builder-react'

const session = createBuilderSession(schema)

<FormancyBuilder session={session} />
```

## It is a keyboard interface first

There is no drag surface yet, and that is the order on purpose. WCAG 2.2
SC 2.5.7 requires every dragging movement to have a non-dragging alternative
that does the same job. Built the other way round, the drag ships and the
keyboard path becomes a follow-up competing with features — so the keyboard
path is the whole thing, and a drag surface will be a second way to reach the
same commands.

| Key | What it does |
|---|---|
| `↑` `↓` | Move between fields, in the order a person reading the form meets them |
| `Home` `End` | First and last field |
| `m` | Move the focused field — opens a list of destinations |
| `Delete` | Remove it |
| `Ctrl+Z` / `Ctrl+Y` | Undo / redo |

The tree is **one tab stop**, not one per field: a hundred-field form should
not cost a hundred tabs to get past.

## Destinations are sentences

A `Location` is `{ parent, index }`, which is right for the engine and useless
to somebody choosing from a list — especially somebody hearing it rather than
seeing it. Every destination is described instead:

> Billing address, between Street and City

Two details make that true rather than nearly true. The description excludes
the field being moved, because a move index counts positions *after* it is
lifted out — otherwise the list offers "between Customer and Billing" for what
is really "after Billing", naming the field doing the travelling. And the
field's current position is not offered at all: it is a legal destination, and
a list whose first entry does nothing makes you read it to find that out.

## What it does not do yet

Inserting fields from a palette, editing properties, and authoring logic. The
commands for all three exist in `builder-core`; this package covers structure.
