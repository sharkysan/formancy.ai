---
title: The schema
description: How a formancy form document is shaped, why pages scope no data, and what makes a field's identity.
---

A form is one JSON document. Four things live in it, kept apart on purpose:

```jsonc
{
  "specVersion": "1",
  "id": "order",
  "title": "Order",
  "model":  { "fields": [ /* what the form collects */ ] },
  "logic":  { "rules":  [ /* how it behaves */ ] }
}
```

`model` is the **data contract**. `logic` is **behaviour**. They are separate so
that a rule can be reviewed on its own, and so the same data model can
eventually carry different behaviour per deployment. (Presentation and text get
their own sections at spec v1 — see the note at the end.)

## Structure decides data shape

Three field types hold other fields, and each has a different effect on the
submission:

| Type | Effect on the data | A child's path |
| --- | --- | --- |
| `group` | nests an object | `address.city` |
| `repeater` | holds rows | `items[0].name` |
| `page` | **nothing at all** | `email` |

That third row is the one worth internalising. **A page scopes no data.** If it
did, moving a field from step two to step three of a wizard would rewrite the
shape of every submission already collected — a data migration caused by a
purely cosmetic decision. So pages are presentation, the payload stays flat
across them, and a form author can reorganise steps freely.

## The answer shape each type stores

Most types store one value. Three do not, and the difference matters more than
the control does — it is what a consumer reading the submission gets.

| Type | Answer | Added in |
| --- | --- | --- |
| `text`, `textarea`, `date`, `hidden` | a string | 1 |
| `number` | a number | 1 |
| `checkbox` | a boolean — a required one is a consent gate, so only a tick satisfies it | 1 |
| `select`, `radio` | the chosen option's `value` | 1 |
| `selectboxes` | the chosen values, **in the options' declared order** so two people who choose the same answers store the same array | 2 |
| `file` | `{ id, name, size, contentType, storageKey }` per attachment — never the bytes | 2 |

A `file` answer is written by the upload endpoints rather than typed: the
client asks `POST /f/:path/files` where to put a file, PUTs the bytes to the
URL it gets back, and puts the reply in the submission. The server claims those
files inside the submission's own transaction, so a submission exists if and
only if the files it names belong to it, and a file nobody claims is deleted a
day later ([0055](../../../../../docs/decisions/0055-files-are-claimed.md)).
| `richtext` | a string in the [formatted-text grammar](#formatted-text-is-not-html) | 2 |

`minItems` and `maxItems` bound the list types, the same two properties a
repeater uses: "how many" is one question however it is asked. An empty list is
not an answer, so `required` is what makes a choice compulsory rather than a
minimum of one.

## Formatted text is not HTML

A `richtext` answer is stored in a small closed grammar — paragraphs, bullet
and numbered lists, `**bold**`, `*italic*` and `[links](https://example.ch)`
— and nothing else. It is parsed once into a typed tree and rendered as
elements, so no consumer is ever handed a string to interpret.

That is a security decision. A form answer is written by anyone who can reach
the form and read later by an administrator, which is the exact shape of a
stored cross-site scripting bug. Storing HTML would make correctness the
responsibility of every consumer forever — this renderer, the other renderer,
a CSV export, a PDF, somebody's own dashboard — and one of them would get it
wrong.

A link may use `http:`, `https:` or `mailto:`. Anything else renders as the
literal text somebody typed: visible, harmless and honest, where dropping it
would leave a reader wondering where their link went.

### The editor over it

Nobody has to type the markers. The field renders a toolbar — **bold**,
*italic*, link, bulleted and numbered lists, with <kbd>Ctrl</kbd>+<kbd>B</kbd>
and <kbd>Ctrl</kbd>+<kbd>I</kbd> — and it toggles: pressing **Bold** on text
that is already bold takes the markers off again. Underneath the box is a live
preview, rendered by the same parser that will render the stored answer.

That is a toolbar over a `<textarea>`, which is the default and needs nothing
installed. The control stays something every assistive technology already
understands, the value cannot express anything the grammar cannot, and both
renderers run the same transformation — it lives in `@formancy/spec`, so a
**Bold** button cannot mean one thing in React and another in Angular.

**If you want a real editing surface, install one.** `@formancy/tiptap` is a
TipTap editor configured from this grammar, so it cannot produce a construct the
grammar has no way to store — and because ProseMirror's document is JSON rather
than markup, nothing ever holds a string of HTML. It is a separate package you
opt into, because ProseMirror is larger than the renderer and most forms have no
rich-text field. See **[Rich text](/concepts/rich-text/)** for the two lines that
switch it on, and for the interface if you would rather supply your own editor.

```ts
import { parseRichText, richTextToPlain } from '@formancy/spec'

parseRichText('**urgent** — see [the notes](https://example.ch)')
richTextToPlain('**urgent**') // 'urgent', for a CSV cell or a search index
```

## A key is an identity, forever

```jsonc
{ "key": "email", "type": "text", "label": "Email", "required": true }
```

`key` is how an answer is addressed in the submission, in an export column, and
in every logic rule. Changing it is not an edit — it is a migration:

```jsonc
{ "key": "workEmail", "type": "text", "renamedFrom": "email" }
```

Declare `renamedFrom` in the same edit that changes the key, and the answers
already collected follow the field across. Omit it, and the change is correctly
read as *one field deleted, another created* — which is what it looks like from
the outside. formancy refuses to guess: a wrong guess silently moves one
field's answers into a different field.

Two guards back this up. The old key must be gone from the form (otherwise you
have made a copy, not a rename), and two fields may not both claim to be
renamed from the same dead key — old answers can only move to one place.

## Clearing on hide

When a rule hides a field, what happens to what the person already typed?

```jsonc
{ "key": "canton", "type": "text", "clearOnHide": true }   // the default
```

On (the default), the answer is removed from the submission, so a hidden branch
cannot carry data. Off, the answer is kept and returns when the field reappears.

It lives on the **model** rather than in logic because it decides the shape of
the stored data, and the server applies the same reading it does — stripping
values under branches *its own* evaluation says are hidden.

## Built-in validation

Beyond `required`, the model carries the checks that need no expression:

```jsonc
{ "key": "qty",   "type": "number", "min": 1, "max": 100 }
{ "key": "name",  "type": "text",   "minLength": 2, "maxLength": 50 }
{ "key": "code",  "type": "text",   "pattern": "[A-Z]{3}" }
{ "key": "email", "type": "text",   "format": "email" }
```

Three things are deliberate here:

- **Emptiness is `required`'s job alone.** An empty optional field trips no
  bound, so an author never writes "unless it is empty" into a rule.
- **A pattern matches the whole answer**, not a substring — otherwise
  `[A-Z]{3}` quietly accepts `xxABCxx`.
- **`format` is a closed list** (`email`, `url`, `uuid`). Each is one
  well-tested check rather than a regular expression pasted into every form.
  And a `pattern` that does not compile fails the *author* when they save, not
  the person filling in the form mid-keystroke.

## Validation happens when you save

`validateSchema` from `@formancy/spec/validate` is the gate, and the server runs
it before anything is persisted. It enforces what JSON Schema alone cannot:
duplicate keys, the `renamedFrom` rules above, and — in spec v0 — repeaters
nested inside repeaters.

```ts
import { validateSchema } from '@formancy/spec/validate'

const result = validateSchema(document)
if (!result.valid) {
  for (const error of result.errors) console.log(error.path, error.message)
}
```

Messages are written for a form author, not a compiler.

## Words: `i18n`

Anywhere a person reads something — a field's `label`, an option's `label`, a
heading in a layout — the document may carry either the words themselves or a
reference into a catalogue:

```jsonc
{
  "model": {
    "fields": [{ "key": "email", "type": "text", "label": { "$t": "email.label" } }]
  },
  "i18n": {
    "defaultLocale": "en",
    "messages": {
      "en": { "email.label": "Email address" },
      "de": { "email.label": "E-Mail-Adresse" }
    }
  }
}
```

The section is optional, and a plain string stays a plain string, so a
monolingual form never has to think about it.

Two rules make this safe rather than merely possible. Every reference must
resolve in the **default locale** — `validateSchema` refuses a document whose
label points at a message nobody wrote, because the failure mode is
`email.label` appearing in front of a customer. And a **missing translation in
some other locale falls back to the default** rather than showing the id: an
untranslated label is a small problem, a message id on screen is a large one.

You can see this in the playground: its demo form is written entirely in
references, and its language switcher includes a deliberately half-finished
French catalogue so the fallback is visible rather than described.

Resolution happens in the engine, not in each renderer:

```ts
const engine = createFormEngine({ schema, locale: 'de' })
engine.getFieldSnapshot(['email']).label // "E-Mail-Adresse"
engine.text({ $t: 'email.label' })       // the same, for anything else
```

That is the same reasoning that put ids and ARIA wiring in the engine: React
and Angular cannot disagree about what a field is called if neither of them
decides. The locale is fixed when the engine is built — snapshots are
identity-stable, and a locale that moved underneath them would leave every
cached snapshot quietly wrong — so switching language means building a new
engine.

## Arrangement: `layouts`

A layout places fields somewhere other than model order, and a form may have
several over the same data:

```jsonc
{
  "layouts": [
    {
      "name": "web",
      "nodes": [
        { "kind": "section", "label": { "$t": "about.you" }, "children": [
          { "kind": "row", "children": [
            { "kind": "field", "path": "firstName" },
            { "kind": "field", "path": "lastName" }
          ] }
        ] }
      ]
    }
  ]
}
```

Nodes address fields by **data path**, the same paths everything else in
formancy uses. A layout may leave a field out — a print layout that omits the
consent checkbox is doing its job — but it may not place one twice, and it may
not name a path the model does not define. `unreferencedPaths(schema, 'web')`
tells a builder what a given arrangement is not showing.

Layouts are optional too. Without any, fields render in the order the model
declares them, which is what the renderers did before this section existed and
still do.

Version 2 adds two more kinds. A **`tabs`** node shows one child section at a
time, each section's heading supplying its tab's name — presentation only, so
a field in a closed tab is still validated and still submitted, unlike one on a
page the reader has not reached. A **`table`** node declares a column count and
lines its cells up across rows, which stacked rows cannot do because each row
sizes itself independently.

Because addressing is by data path, an arrangement is a *view* of the model and
cannot outlive it: deleting a field removes it from every layout, and renaming
one repoints every layout at the new path. The builder does both as part of the
command, since a layout node naming a field that does not exist is invalid — so
without it, a field could not be deleted or renamed at all once it had been
arranged.

A layout node has no key of its own. It is addressed by position — the second
thing inside the third thing — and every insert or removal renumbers its
neighbours. That is why the builder keeps layout navigation apart from model
navigation, and why a tool editing arrangements has to be careful in a way that
editing fields does not require.

## Why these are separate sections

Labels could have stayed strings and layout could have been implied by nesting.
Keeping words and arrangement out of the model is what lets the same model be
published in five languages and two arrangements without duplicating the thing
that defines what the data *is* — and it is what makes `diffSchemas` able to
say that a translation changed and the data did not.
