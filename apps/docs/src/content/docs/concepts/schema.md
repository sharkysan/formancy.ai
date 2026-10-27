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

A paged form may also have a layout, and then each step is the layout holding that page's
fields: a section, row, table or tab with nothing on the current page is not drawn, and a
field the layout leaves out stays out on every page
([0137](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0137-a-paged-forms-layout-is-drawn-a-page-at-a-time.md)).

## The answer shape each type stores

Most types store one value. Some do not, and the difference matters more than
the control does — it is what a consumer reading the submission gets.

**Every answer is checked for this shape**, in the browser and when the server replays a
submission, whether or not the field has a constraint: an object posted for a `text` field
is refused as `type`. An unanswered field is an absent key. Where the last column says
`null`, a cleared control writes that too; a list is empty as `[]` and never `null`, and an
empty string is an answer only to a field whose answer is text. A `static` field stores
nothing, and a value handed in for one is dropped
([0189](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0189-every-answer-has-the-shape-its-type-says.md)).

| Type | Answer | Added in | Unanswered |
| --- | --- | --- | --- |
| `text`, `textarea`, `hidden` | a string | 1 | absent, `null` or `''` |
| `date` | a `YYYY-MM-DD` string | 1 | absent or `null` |
| `number` | a number | 1 | absent or `null` |
| `checkbox` | a boolean — a required one is a consent gate, so only a tick satisfies it | 1 | absent or `null` |
| `select`, `radio` | the chosen option's `value` | 1 | absent or `null` |
| `selectboxes` | the chosen values, **in the options' declared order** so two people who choose the same answers store the same array | 2 | absent or `[]` |
| `time`, `datetime` | one fixed-width string — a wall clock with no zone, or an instant in UTC | 2 | absent or `null` |
| `file` | `{ id, name, size, contentType, storageKey }` per attachment — never the bytes | 2 | absent or `[]` |
| `richtext` | a string in the [formatted-text grammar](#formatted-text-is-not-html) | 2 | absent, `null` or `''` |
| `signature` | `{ drawn }`, the strokes as points, or `{ typed }`, a name — never both, and never stroke timing | 3 | absent or `null` |
| `ranking` | the chosen values **in the order chosen**, most preferred first — an option nobody ranked is not in it ([0138](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0138-a-ranking-stores-the-order-chosen.md)) | 4 | absent or `[]` |
| `matrix` | `{ row: column }` for each row answered, under the rows' values — `{}` untouched; a required one needs every row ([0139](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0139-a-matrix-answers-one-question-per-row.md)) | 4 | absent or `{}` |

A `file` answer is written by the upload endpoints rather than typed: the
client asks `POST /f/:path/files` where to put a file, PUTs the bytes to the
URL it gets back, and puts the reply in the submission. The server claims those
files inside the submission's own transaction, so a submission exists if and
only if the files it names belong to it, and a file nobody claims is deleted a
day later ([0055](../../../../../docs/decisions/0055-files-are-claimed.md)).

`minItems` and `maxItems` bound the list types, the same two properties a
repeater uses: "how many" is one question however it is asked. An empty list is
not an answer, so `required` is what makes a choice compulsory rather than a
minimum of one. On a repeater they bound its rows, with the same codes: it opens
with `minItems` rows and offers no button to remove one below it, offers no add
button at `maxItems`, and refuses a submission with more; `required` on a repeater
asks for a row
([0184](../../../../../docs/decisions/0184-a-repeater-is-validated-as-a-field-is.md)). On a ranking they bound how many options are put in order: "your
top three" is `maxItems: 3`, and a complete order is `minItems` set to the number of
options. A ranking starts empty rather than in the options' written order, because an
order nobody chose is not an answer.

An option of a `selectboxes` field may be one chosen alone — "None of these":

```json
{ "value": "none", "label": "None of these", "exclusive": true }
```

Ticking it clears the others and ticking another clears it, and a list holding it with
anything else is refused with `exclusive`, on the server too. It is how a list says *none*
as an answer, which an empty list cannot: that is also what somebody who skipped the
question leaves. Spec version 5
([0199](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0199-an-option-can-be-chosen-only-on-its-own.md)).

A radio group, a list of ticks or a ranking can show its options in a shuffled order, so the
first is not chosen for being first:

```jsonc
{ "key": "channel", "type": "radio", "label": "How did you hear of us?", "shuffle": true,
  "options": [ { "value": "friend", "label": "A friend" }, { "value": "press", "label": "The press" },
               { "value": "other", "label": "Other", "keepPlace": true } ] }
```

The engine chooses the order once, from the `random()` it is given — so a shuffled form needs
`capabilities` even without rules — and keeps it while the form is filled in; an option with
`keepPlace` stays where it is written. Only presentation: what is ticked is stored in the order
written above, so two people choosing the same answers store the same list. Spec version 5
([0200](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0200-options-can-be-shown-in-a-shuffled-order.md)).

An option on a `radio` or `selectboxes` field may carry a picture, which changes
nothing about the answer:

```jsonc
{ "value": "express", "label": "Express", "image": { "src": "/img/express.svg", "alt": "A parcel, moving fast" } }
```

The picture is drawn inside the option's label, so pressing it chooses the
option, and `alt` joins the option's name. Leave `alt` out when the label says
everything: the picture is then decoration. A `select` cannot show a picture,
nor can a tag picker's chips, a ranking or a matrix, so a document asking for one there is refused
rather than quietly showing nothing. `src` is an `https://` address, a path on
the site that shows the form, or the picture itself as a `data:image/` address —
and an address on another site tells that site who opened the form. Spec version 4
([0126](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0126-an-option-may-carry-a-picture.md)).

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
rich-text field. See **[Rich text](/docs/concepts/rich-text/)** for the two lines that
switch it on, and for the interface if you would rather supply your own editor.

```ts
import { parseRichText, richTextToPlain } from '@formancy/spec'

parseRichText('**urgent** — see [the notes](https://example.ch)')
richTextToPlain('**urgent**') // 'urgent', for a CSV cell or a search index
```

## A label names, a description explains

```json
{ "key": "name", "type": "text", "label": "Full name", "description": "As on your passport." }
```

The label is the control's accessible name — what a screen reader says when the control is
reached, and what a person scanning the form reads. Help text written into it makes every one of
those a paragraph. A `description` is drawn under the question and named in the control's
`aria-describedby`, so it is read out after the name rather than as part of it; on a group, a
page or a repeater it describes the whole set. It is text or a reference into the catalogue, like
the label, and the builder extracts it for translation with the rest. It needs spec version 5,
which is open: a version 4 document carrying one is refused by name
([0194](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0194-spec-5-opens-with-a-fields-description.md)).

A field that asks about the person filling the form in can also say what its answer is, for a
browser to fill and their own tools to mark — WCAG 1.3.5's input purposes, as `autocomplete`:

```json
{ "key": "email", "type": "text", "label": "Email", "autocomplete": "email" }
```

On text, long text, number, date and choice fields, from a closed list that leaves out the
password and payment-card purposes on purpose: a form platform keeps its answers, and a hint that
invites a browser to put a card number into a stored submission is not one to offer. Spec
version 5 ([0195](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0195-a-field-says-what-its-answer-is-for-autofill.md)).

A text, long text or number field can show an example of its answer in the empty box:

```json
{ "key": "phone", "type": "text", "label": "Mobile", "placeholder": "079 123 45 67" }
```

An example, never the question: it disappears as soon as somebody types, and many screen readers
never announce it, so what the question asks stays in the label and how to answer it goes in the
`description`. On a masked field it replaces the shape the control would otherwise draw. Text or a
catalogue reference, extracted for translation with the rest; spec version 5
([0196](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0196-a-placeholder-is-an-example-never-the-label.md)).

A field that holds one answer, or a list of ticks, can start answered:

```json
{ "key": "delivery", "type": "radio", "label": "Delivery", "default": "standard", "options": [ … ] }
```

The default is where **something fresh** starts — a form opened with nothing handed in, a row
added to a repeater, a field shown again after a rule hid and cleared it — and nothing else. A
resumed draft, a prefill and the server's replay of a submission start exactly as they were
handed in, so a default never puts back an answer somebody cleared or stores one nobody sent. A
host whose prefill should start as a new form would asks for that:

```ts
import { createFormEngine, withDefaults } from '@formancy/core'

const engine = createFormEngine({ schema, initialValue: withDefaults(schema, { email }) })
```

A default is an answer, so it is of the answer's own type, it is not translated, and the form
refuses to open with one its field would refuse — not an option, out of bounds, not a date. It is
submitted unless somebody changes it, and nothing records that it was left alone: make it the
answer most people give, and give a question whose answer must be considered none. Spec version 5
([0197](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0197-a-default-is-where-something-fresh-starts.md)).

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

Two keys are refused. `_id` is how every repeater row carries its identity, so a
field of that name would collide with it in every row. `__proto__` is a name
every JavaScript object already has: an answer written under it replaces the
object's prototype instead of being stored, so `validateSchema` refuses it as a
field's key and as a matrix row's value, with the code `key.unstorable`. Every
other name an object inherits — `constructor`, `toString`, `valueOf` — is a key
like any other, and its answer is read as the submission's own
([0185](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0185-an-answer-is-what-the-value-holds-as-its-own.md)).

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
{ "key": "phone", "type": "text",   "mask": "(999) 999-9999" }
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
- **A mask stores what was typed, not what was shown.** `9` takes a digit, `a`
  a letter and `*` either; any other character — the brackets, the space, the
  dash — is written by the control, and a backslash before `9`, `a` or `*` makes
  the control write it (`+4\9` writes the 9 of +49). The answer above is `5551234567`, so
  changing how the mask is drawn never orphans a stored answer, and the server
  receives the number rather than one spelling of it. An answer that leaves a
  position empty is refused with the code `mask` — by the engine, so a payload
  posted straight at the server is held to it too. Spec version 4
  ([0125](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0125-a-mask-stores-what-was-typed.md)).

## Validation happens when you save

`validateSchema` from `@formancy/spec/validate` is the gate, and the server runs
it before anything is persisted. It enforces what JSON Schema alone cannot:
duplicate keys, the `renamedFrom` rules above, the two refused keys, and — in
spec v0 — repeaters nested inside repeaters.

```ts
import { validateSchema } from '@formancy/spec/validate'

const result = validateSchema(document)
if (!result.valid) {
  for (const error of result.errors) console.log(error.path, error.message)
}
```

Messages are written for a form author, not a compiler. Each error also carries a `code`
naming which sentence it is and the `values` that sentence names — `{ code: 'key.taken',
values: { key: 'email' } }` beside *Another field already uses the key "email"* — so it can
be said in another language without reading the English back. The English for every code
is `SCHEMA_ERRORS` in `@formancy/spec`; `@formancy/builder-core` ships German and French
(`SCHEMA_ERRORS_DE`, `SCHEMA_ERRORS_FR`), and the server's `422` for an invalid schema
returns `code` and `values` with each error as well. Rewording a sentence is free; a code is renamed
only with a changelog entry
([0122](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0122-a-validator-error-has-a-code.md)).

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
French catalogue so the fallback is visible rather than described. The builder's
**Translations** tab shows the same catalogue from the translator's side: choose
French there and every message nobody has translated yet is marked, beside the
English a reader is shown instead.

The tab can also ask a model for what is missing. Choose French, and a button above the
table asks a model for every message with no French yet. The request holds those
messages, the English each translates, where the form uses each — *label of a select
question "Country"*, *option of "Country"* — and the French the form already has, so the
register matches. It holds nothing else: no rule, and not the document. On the website
you carry the request to a chat of your own and paste the answer back, as for describing
a change in words. The answer is the same catalogue file a translator downloads, and it
is reviewed message by message before anything lands: the English beside what was there
and what is proposed, a mark where a translation was made from English that has since
changed or is the same as its English, and the form as it would read in French. Apply
writes it as one undo step. Only messages nobody has translated are asked for or written,
so a translation somebody made is never replaced. The review is only as good as your
French: a fluent translation that asks a different question passes every check
([0161](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0161-a-model-translates-only-what-is-missing.md)).

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

The words a form says that its author did not write — Next, Back, Submit, a repeater's Add
and Remove and which row a button acts on, the required hint, the error summary's heading,
what a field announces while a file is sent — follow the questions. They are not in the
document: they are the renderers', in `@formancy/core/words`, shipped in English, German and
French, and every renderer alike reads them in the catalogue the questions are read in — the
engine's locale where the document has a catalogue for it, its default where it has not, as
`resolvedLocale` in `@formancy/spec` says. So a form whose reader chose German says *Weiter*
and *Absenden* around its German questions, a reader who chose French on a form with no French
reads its default language in both, and the playground's Language switch changes both. The browser's language never decides them; a host adds a
language or changes a word through its renderer — see the
[React](/docs/start/react/#the-forms-own-words-in-its-language) and
[Angular](/docs/start/angular/#the-forms-own-words-in-its-language) quickstarts. What stays
in one language: a repeater's `addLabel` and `removeLabel` are plain strings, so a form that
sets them says them as written
([0171](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0171-the-renderers-words-are-the-forms-language.md)).
A field's errors follow the form's language: the engine reports a code and the field says a
sentence with its own limit in it ([0191](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0191-an-error-is-said-not-coded.md)).

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

A node may name a **group**, which places it whole: it is drawn as its fields, in
the order the model declares them, under the group's label the way a labelled
section is. Its fields are then placed, so none of them may be placed again
beside it — place the group or its fields, not both.

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
