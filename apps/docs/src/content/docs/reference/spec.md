---
title: Spec reference (v0)
description: Every property of a formancy form document, generated from the JSON Schema in packages/spec.
---

:::note[This page is generated]
Generated from `packages/spec/formancy.schema.json` (the JSON Schema for spec
version 0) by `apps/docs/scripts/generate-spec-reference.mjs`. The schema is
the source of truth — edit it, not this page.
:::

:::caution
Spec version 0 is **unstable**. See [Versioning](/concepts/versioning/) for what
that means and when it freezes.
:::

## The form document

A formancy form, written against version 0 of the spec. The document holds the data contract only: what the form collects, and under what names. How it looks and when it appears are separate concerns, so the same form can have more than one presentation.

### `specVersion`

required · the constant `"0"` · default `"0"`

**Spec version.** Which version of the formancy spec this form is written against. Always "0" today. It is independent of the package version, and it only changes when the shape of the document changes.

### `id`

required · Form ID (see below) · max length 128 · pattern `^[A-Za-z0-9][A-Za-z0-9._-]*$`

**Form ID.** The form's stable identifier. It appears in the form's URL and in exported data, so choose it once and leave it alone: changing it breaks existing links and detaches the submissions already collected.

Examples: `"contact-us"`, `"expense-claim"`

### `title`

required · string · min length 1 · max length 200

**Title.** The form's name, as the person filling it in will read it at the top of the page.

Examples: `"Contact us"`, `"Expense claim"`

### `model`

required · Data model (see below)

**Data model.** Everything the form collects.

### `logic`

optional · Logic (see below)

**Logic.** The form's behaviour: when fields show, what they compute, and what counts as a valid answer. Rules live here, apart from the data model, so the same model can carry different behaviour per deployment and so a rule can be reviewed on its own.

### `i18n`

optional · Translations (see below)

**Translations.** The form's words, apart from its structure.

### `layouts`

optional · array of Layout

**Layouts.** Named arrangements of the model. Without any, fields appear in the order the model declares them.

## Fields

One field of the form. Most fields collect a single answer; a group, a page and a repeater collect nothing themselves and hold other fields instead.

### Properties every field has

#### `key`

required · Key (see below) · max length 64 · pattern `^[A-Za-z_][A-Za-z0-9_]*$`

**Key.** The name this field's answer is stored under, and the field's identity for as long as the form exists. It becomes a column in exported data and a variable in logic expressions, so it has to read like an identifier: a letter or an underscore, then letters, digits or underscores. Changing a key is a data migration rather than an edit, so say where it came from with "renamedFrom".

Examples: `"email"`, `"invoice_total"`, `"passengerCount"`

#### `type`

required · Field type (see below)

**Field type.** What kind of answer the field collects, or — for a group, a page or a repeater — how it holds the fields inside it. The type decides which control the reader sees and how the answer is stored, so changing it on a live form may leave existing answers unreadable.

#### `required`

optional · boolean · default `false`

**Required.** Whether the form can be sent without an answer to this field. Turning this on for a field that already exists invalidates the submissions that left it empty, so publishing reports it as a lossy change.

#### `renamedFrom`

optional · Key (see below) · max length 64 · pattern `^[A-Za-z_][A-Za-z0-9_]*$`

**Renamed from.** The key this field used to be called. Set it in the same edit that changes the key and the answers already collected follow the field across. The old key must be gone from this form: if a field still uses it, you have made a copy rather than a rename, and the two would fight over the same answers.

Examples: `"email"`, `"invoice_total"`, `"passengerCount"`

#### `clearOnHide`

optional · boolean · default `true`

**Clear when hidden.** What happens to an answer when a rule hides its field. On (the default), the answer is removed from the submission, so a hidden branch cannot carry data. Off, the answer is kept and comes back when the field reappears.

#### `label`

optional · Text (see below)

**Label.** What the person filling the form in reads next to this field, or a reference to it in the message catalogue.

### Field types

What kind of answer the field collects, or — for a group, a page or a repeater — how it holds the fields inside it. The type decides which control the reader sees and how the answer is stored, so changing it on a live form may leave existing answers unreadable.

- `"text"` — **Single-line text.** One line of free text: a name, a reference, a short answer.
- `"textarea"` — **Multi-line text.** A box several lines tall, for a message or a description.
- `"number"` — **Number.** A numeric answer, for amounts and counts. Do not use it for phone numbers, postcodes or account numbers: those lose their leading zeros.
- `"checkbox"` — **Checkbox.** A single yes-or-no answer, such as accepting the terms.
- `"select"` — **Dropdown.** One answer picked from a list, shown collapsed. Best when the list is long.
- `"radio"` — **Radio buttons.** One answer picked from a list, with every option visible at once. Best for a handful of options.
- `"date"` — **Date.** A calendar date, with no time of day.
- `"hidden"` — **Hidden value.** Travels with the submission but is never shown to the reader, such as a campaign code or a referral source.
- `"static"` — **Static text.** Text shown to the reader that collects nothing: a heading, an explanation, a notice.
- `"group"` — **Group.** Related fields kept together on the same page. Collects nothing itself.
- `"page"` — **Page.** One step of a form split over several screens. Collects nothing itself.
- `"repeater"` — **Repeater.** A set of fields the reader can fill in more than once, such as one block per passenger. A repeater cannot be placed inside another repeater in this version of the spec.

### Per-type properties

Some properties only exist on some types. The schema states these as conditional blocks; they are listed here per type.

#### Containers: `group`, `page`, `repeater`

A group, a page or a repeater. It collects no answer of its own; the fields inside it do.

##### `fields`

optional · Fields (see below)

**Child fields.** The fields held inside this container. Their keys are unique across the whole form, not just within the container.

Every other type is an answer field: a field that collects one answer and holds no other fields.

#### `select`, `radio`

##### `options`

optional · array of Option · at least 1 item

**Options.** The answers this field offers, in the order they appear.

#### `repeater`

##### `minItems`

optional · integer · minimum 0 · maximum 1000

**Minimum rows.** How many rows the form opens with and will not go below. A repeater that promises one row shows one empty row, not an add button and a shrug.

##### `maxItems`

optional · integer · minimum 1 · maximum 1000

**Maximum rows.** How many rows a person may add.

##### `addLabel`

optional · string · min length 1 · max length 300

**Add button label.** The accessible name of the control that adds a row.

##### `removeLabel`

optional · string · min length 1 · max length 300

**Remove button label.** The accessible name of the control that removes a row. The renderer appends the row's position, so a screen reader user hears which row a button kills.

#### `number`

##### `min`

optional · number

**Minimum.** The smallest value that counts as a valid answer.

##### `max`

optional · number

**Maximum.** The largest value that counts as a valid answer.

#### `text`, `textarea`

##### `minLength`

optional · integer · minimum 0

**Minimum length.** The shortest answer that counts, in characters.

##### `maxLength`

optional · integer · minimum 1

**Maximum length.** The longest answer that counts, in characters.

##### `pattern`

optional · string · min length 1 · max length 500

**Pattern.** A regular expression the whole answer must match. Checked when the form is saved, so a broken or dangerous pattern never reaches a person filling the form in.

##### `format`

optional · one of `"email"`, `"url"`, `"uuid"`

**Format.** A named shape the answer must have. A closed list on purpose: each entry is one well-tested check, not a per-form regular expression.

Values of `format`:

- `"email"` — **Email address.** One address, with a mailbox and a domain.
- `"url"` — **Web address.** An absolute http or https URL.
- `"uuid"` — **UUID.** A universally unique identifier in its canonical hex form.

## Logic rules

Every rule of the form, in one flat list. A rule names the field it applies to; the order here does not matter, because evaluation order comes from what depends on what.

### Properties of a rule

One piece of behaviour, attached to one field.

#### `target`

required · string · min length 1 · max length 512

**Target field.** The data path of the field this rule applies to, e.g. "email", "address.city", or "items[].qty" for a field inside a repeater row.

#### `kind`

required · one of `"visible"`, `"disabled"`, `"required"`, `"computed"`, `"validate"`

**Kind.** What the rule decides about its field.

#### `cel`

required · string · min length 1 · max length 2000

**Expression.** The rule itself, in the Common Expression Language. It may read other fields by their data paths; what it reads is what it reacts to.

#### `code`

optional · string · min length 1 · max length 64

**Error code.** For a validate rule: the machine-readable code the field carries while the check fails. The message a person reads is looked up from this code per language, so it does not live here.

#### `editor`

optional · value

**Editor state.** What the visual rule editor last knew about this rule. Regenerated from "cel" when possible; never evaluated. The expression is the single source of truth.

### Rule kinds

- `"visible"` — **Visible.** Shows the field while the expression is true. A hidden field is not validated, and by default its answer is removed from the submission.
- `"disabled"` — **Disabled.** Greys the field out while the expression is true. A disabled field keeps its answer and stays visible.
- `"required"` — **Required.** Makes the field required while the expression is true, on top of any fixed required flag in the model.
- `"computed"` — **Computed.** Writes the expression's result into the field whenever something it reads changes. The person filling the form in cannot type over it.
- `"validate"` — **Validate.** Checks an answer. While the expression is false, the field carries the error named by "code". A field can have any number of these.

## Named definitions

The remaining definitions the properties above refer to.

### Form ID

max length 128 · pattern `^[A-Za-z0-9][A-Za-z0-9._-]*$`

A short URL-safe name: letters, digits, dots, dashes and underscores, beginning with a letter or a digit.

Examples: `"contact-us"`, `"expense-claim"`

### Data model

The data contract of the form: its fields, and the names their answers are stored under. Presentation and conditional logic live outside the model, which is why one model can be shown in more than one way.

#### `fields`

required · Fields (see below)

**Fields.** The fields of the form, in the order the reader meets them. Order is presentation: a field is identified by its key, so moving one up or down does not change the data you have already collected.

### Fields

A list of fields.

### Key

max length 64 · pattern `^[A-Za-z_][A-Za-z0-9_]*$`

The name this field's answer is stored under, and the field's identity for as long as the form exists. It becomes a column in exported data and a variable in logic expressions, so it has to read like an identifier: a letter or an underscore, then letters, digits or underscores. Changing a key is a data migration rather than an edit, so say where it came from with "renamedFrom".

Examples: `"email"`, `"invoice_total"`, `"passengerCount"`

### Option

One answer a select or radio field offers.

#### `value`

required · string · min length 1 · max length 200

**Value.** What is stored in the submission when this option is chosen. Stable like a field key: changing it detaches the answers already collected.

#### `label`

required · Text (see below)

**Label.** What the person choosing reads.

### Message reference

Points at an entry in the message catalogue instead of spelling the text out here, so the same form can be read in more than one language.

#### `$t`

required · string · min length 1 · max length 200

**Message id.** The key this text is stored under in every locale.

### Text

Something a person reads: either the words themselves, or a reference into the message catalogue.

### Translations

The words of the form, kept apart from its structure so the same form can be published in several languages without duplicating it.

#### `defaultLocale`

required · string · min length 2 · max length 35

**Default locale.** The language every message must exist in. Other languages may be incomplete; a missing translation falls back to this one rather than showing an id.

#### `messages`

required · object

**Catalogues.** One catalogue per language, each mapping a message id to the words a person reads.

### Layout node

Either one field placed on the page, or a container holding more nodes.

#### Field placement

##### `kind`

required · the constant `"field"`

**Kind.** Marks this node as placing a single field.

##### `path`

required · string · min length 1 · max length 512

**Field path.** The data path of the field to place here, e.g. "email" or "address.city".

#### Grouping

##### `kind`

required · one of `"section"`, `"row"`, `"column"`

**Kind.** How the children are arranged: stacked under a heading, side by side, or in a column.

##### `label`

optional · Text (see below)

**Heading.** Optional heading for the group.

##### `children`

required · array of Layout node

**Children.** The nodes inside this group.

### Layout

One arrangement of the model. A form may have several over the same data — a web layout and a print layout collect identical answers.

#### `name`

required · string · min length 1 · max length 64

**Name.** How this arrangement is asked for, e.g. "web" or "print". Unique within the form.

#### `nodes`

required · array of Layout node

**Nodes.** What this arrangement places, in the order a person meets it.
