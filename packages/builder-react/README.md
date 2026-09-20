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

## It is a keyboard interface first, and a drag surface second

Both work. The order they were built in is the point: WCAG 2.2 SC 2.5.7
requires every dragging movement to have a non-dragging alternative that does
the same job, and built the other way round the drag ships while the keyboard
path becomes a follow-up competing with features. Here the keyboard path is the
whole interface and dragging calls the same session commands — remove it and
nothing is lost but the convenience.

Dragging only offers drops the session will accept. The indicator is drawn from
the computed destination, so an illegal target shows no line and takes no drop;
allowing one and refusing it afterwards makes the field snap back with no
explanation. Every drop is announced through the same live region a keyboard
move uses, so a drag is not a silent command for somebody using both.

| Key | What it does |
|---|---|
| `↑` `↓` | Move between fields, in the order a person reading the form meets them |
| `Home` `End` | First and last field |
| `a` | Add a field — asks what, then where |
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

## The panels are generated, not written

Both the field palette and the property panel are read out of
`packages/spec/formancy.schema.json`, including every label and hint. The
schema already says which types exist and which properties belong to which
type — that is what its `oneOf` and `allOf`/`if`/`then` branches are for.

Written by hand instead, they rot within two releases: a property is added to
the spec, nobody remembers the panel, and the builder quietly cannot set it.
The tests assert that a text field is offered `pattern` and not `min`, and a
number field the reverse, without either list appearing in this package.

## Choices get their own editor

Everything in the property panel is generated except a `select` or `radio`
field's `options`. The schema says "array of objects", and the honest generic
rendering of that is a textarea full of JSON.

The editor distinguishes the two columns, because they are not the same kind of
thing. **Stored value** is identity — changing it orphans every answer already
given, exactly as a field key does — and is shown monospaced. **Choice label**
is what a person reads and is safe to reword.

It holds a local draft. Clearing a label to retype it makes it empty for a
moment, the schema requires a non-empty one, and so the session refuses it — a
purely controlled input then snaps back mid-word and the next keystroke appends
to the old text. Typing "Schweiz" over "Switzerland" produced
"SwitzerlandSchweiz" until this existed.

## Styling

The components ship no CSS. They emit `data-formancy-part` hooks, and
`@formancy/themes/workbench.css` is a stylesheet that dresses them in the
three-pane inspector layout the admin and playground use:

```ts
import '@formancy/themes/workbench.css'
```

That file styles the *tool*. `blueprint.css` and `dusk.css` style the *forms*
the tool makes. Keeping them apart is why restyling your forms cannot
accidentally restyle the builder.

## Logic is authored as conditions, not expressions

"Country is Switzerland", chosen from three dropdowns, compiled to
`country == "CH"`. A form author should not have to know that `==` compares and
`=` does not exist.

The CEL is the single source of truth for evaluation. The structured condition
is stored beside it as `editor` metadata and is **never evaluated** — it exists
so the panel can reopen a condition instead of parsing CEL back. If both were
evaluable, client and server drift would return through the side door.

The generated expression is shown, before the rule is added and after. A form
author need not read it; a developer should not have to guess it.

Two details that are easy to get wrong and are tested against the real engine
rather than against a string:

- **Numbers compile as doubles.** CEL does not convert implicitly and every
  number a form collects is a double, so `qty > 5` is a type error at check
  time and `qty > 5.0` is what was meant.
- **"Is answered" is a null check**, not a truthiness test. An unanswered field
  is null, and a bare `country` is a type error on a string field rather than
  the falsey check somebody arriving from JavaScript expects.

Values are escaped explicitly — backslash first, then quotes, then newlines and
tabs. Hand-rolled quoting is how an apostrophe in a surname becomes a syntax
error and a trailing backslash becomes something worse: `"C:\"` escapes the
closing quote and the expression runs on into whatever follows. There is a test
for that exact string.

## What it does not do yet

Conditions that combine more than one comparison.
