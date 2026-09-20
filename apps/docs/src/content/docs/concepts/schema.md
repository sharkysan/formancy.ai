---
title: The schema
description: How a formancy form document is shaped, why pages scope no data, and what makes a field's identity.
---

A form is one JSON document. Four things live in it, kept apart on purpose:

```jsonc
{
  "specVersion": "0",
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

## Presentation in spec v0

`label`, `options`, `minItems`, `maxItems`, `addLabel` and `removeLabel` are
real properties today, carried openly rather than through a side channel,
because a form without labels is unusable. They are **temporary**: spec v1
replaces them with proper `i18n` and `layout` sections, and the migrator will
move them. See [Versioning](/concepts/versioning/) and `MIGRATIONS.md`.
