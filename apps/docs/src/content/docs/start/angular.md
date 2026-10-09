---
title: "Quickstart: Angular"
description: Render a working formancy form in Angular with provideFormancy, injectField and the FormancyForm component.
---

## Install

```bash
npm install @formancy/angular @formancy/core @formancy/spec
```

`@angular/core` is a peer dependency, and the binding targets Angular 22. To
work inside the monorepo instead, clone
[the repository](https://github.com/sharkysan/formancy.ai) and run
`pnpm install && pnpm build`.

:::note[Beta]
The packages are published with provenance, and their APIs will change before 1.0. The
*document format* is frozen and stays frozen: `specVersion: "1"`, `"2"` and `"3"` all are,
and each later version only adds. A reader **refuses** a document from a version it does
not know rather than ignoring the part it cannot read, so the version a release speaks is
worth checking against the version a document declares — `MIGRATIONS.md` lists both.
:::

formancy's Angular binding targets **Angular 22** and is **zoneless**: it never
touches `zone.js`, never calls `ChangeDetectorRef`, and never re-renders a whole
form. One signal per field, set exactly when the engine says that field changed.

## Provide an engine

`createFormEngine` comes from `@formancy/core` — the same engine the React
renderer uses, and the same one the server replays submissions through.

```ts
import { Component, provideZonelessChangeDetection } from '@angular/core'
import { bootstrapApplication } from '@angular/platform-browser'
import { createFormEngine } from '@formancy/core'
import { FormancyForm, provideFormancy } from '@formancy/angular'
import type { FormSchema } from '@formancy/spec'

const schema: FormSchema = {
  specVersion: '1',
  id: 'contact',
  title: 'Contact us',
  model: {
    fields: [
      { key: 'email', type: 'text', label: 'Email', required: true },
      { key: 'message', type: 'textarea', label: 'Message' },
    ],
  },
}

const engine = createFormEngine({
  schema,
  capabilities: {
    now: () => Date.now(),
    today: () => new Date().toISOString().slice(0, 10),
    random: () => Math.random(),
  },
})

@Component({
  selector: 'app-root',
  imports: [FormancyForm],
  template: `<formancy-form />`,
})
export class AppComponent {}

void bootstrapApplication(AppComponent, {
  providers: [provideZonelessChangeDetection(), provideFormancy(engine)],
})
```

### Why the clock is a parameter

`capabilities` is not boilerplate you can skip. The engine never reads an
ambient clock, because the server has to replay the same submission later and
get **byte-identical** computed values. Injecting `now`, `today` and `random`
is what makes that replay possible — and it is why a schema carrying logic
rules refuses to build without them.

## Drive one field yourself

`FormancyForm` is a convenience. Underneath, every field is a signal you can
bind however your design system wants:

```ts
import { Component } from '@angular/core'
import { injectField } from '@formancy/angular'

@Component({
  selector: 'app-email',
  template: `
    <label [attr.for]="field.snapshot().ids.control">Email</label>
    <input
      [id]="field.snapshot().ids.control"
      [value]="asText(field.snapshot().value)"
      [attr.aria-invalid]="field.snapshot().props.control['aria-invalid']"
      [attr.aria-describedby]="field.snapshot().props.control['aria-describedby']"
      (input)="field.setValue($any($event.target).value)"
      (blur)="field.touch()"
    />
    @if (field.snapshot().touched && field.snapshot().errors.length) {
      <p [id]="field.snapshot().ids.error">{{ field.snapshot().errors.join(', ') }}</p>
    }
  `,
})
export class EmailField {
  readonly field = injectField('email')
  asText(value: unknown): string {
    return typeof value === 'string' ? value : ''
  }
}
```

Note what you did **not** have to get right: the `id`, the `for`, the
`aria-describedby` chain, when `aria-invalid` may appear. The engine mints those
(`snapshot().ids`, `snapshot().props`) so that React and Angular emit identical
accessibility wiring — the correctness lives in one place instead of two.

## The other inject helpers

| Helper | What it gives you |
| --- | --- |
| `injectField(path)` | `snapshot` signal, `setValue`, `touch` |
| `injectRepeater(path)` | `rowCount` signal, `addRow`, `removeRow` |
| `injectWizard()` | `page` signal, `pageCount`, `next`, `back`, `goTo` |
| `injectSubmit()` | submit, with focus moved to the first problem on failure |

`injectWizard()` throws on a form with no pages rather than pretending to be a
one-page wizard: a stepper over a flat form is a bug in the caller, and a loud
error at mount beats a component that silently renders nothing.

## Replacing the built-in components

The defaults ship **zero CSS**. Every part carries a `data-formancy-part`
attribute and a `data-state`, so a design system can style them without
overrides. One exception, and it is the only one: a control sets the
CSS it needs in order to **work**, never how it looks — the signature surface
declares `touch-action: none` on the element, because a touch drag on a drawing
surface is otherwise resolved as a scroll by the browser before any handler runs.
Its height, border, background and cursor are still yours. When styling is not enough, provide your own components through the
registry token — per-path beats per-type beats the defaults:

```ts
import { FORMANCY_REGISTRY } from '@formancy/angular'

providers: [
  provideFormancy(engine),
  { provide: FORMANCY_REGISTRY, useValue: { byType: { text: MyTextField } } },
]
```

### With Angular Material

`@formancy/angular/material` is that registry, filled with Angular Material:

```bash
npm install @angular/material @angular/cdk
```

```ts
import { provideFormancyMaterial } from '@formancy/angular/material'

providers: [provideFormancy(engine), provideFormancyMaterial()]
```

Include a Material theme as you would for any Material component; the adapter ships no CSS.
Text, paragraph, number, date and time are a `matInput` in `<mat-form-field>`; a list is the
platform's `<select>` under `matNativeControl`; ticks and radios are Material's. **What Material
has no equivalent for is drawn by the default control** — a mask, a scanner, a rating or a
slider, a typeahead, a tag picker, a list from a source, a picture on an option, a date-time, a
file, a signature — so no feature disappears. To keep some of your own controls as well, spread
`FORMANCY_MATERIAL_CONTROLS` into your own `byType`.

Two choices worth knowing. A list is the native `<select>`, not `mat-select`, which is a
different control with different keys. A date is the platform's date input inside Material's
field, not Material's datepicker, which converts a calendar day through a `Date` — how a day
becomes the day before in half the world. And one difference from the default controls that
is Material's own: an **empty** required field is never marked `aria-invalid`; the error is
still its description.

It is held to the same conformance fixtures as the default controls, through the same driver,
axe audit included ([0132](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0132-material-draws-what-it-has-an-equivalent-for.md)).

## Editing a form, from Angular

`@formancy/builder-angular` is the builder's structure tree over the same
session the React builder drives. Zoneless, `OnPush`, standalone — one signal
per session, changing exactly once per accepted command.

```bash
npm install @formancy/builder-angular @formancy/builder-core
```

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

It is a **keyboard interface**: `↑` `↓` and `Home`/`End` to move about, `a` to add a
field, `m` to move one, `p` to add a page, `u` to take a container away and keep
what is inside, `Delete` to remove, `Ctrl+Z`/`Ctrl+Y` to undo and redo. The tree
is one tab stop rather than one per field, and every destination is offered as a
sentence rather than an index. The legend under the tree lists every key, so none
of this has to be told to anybody.

What the two builders OFFER is decided once, in `@formancy/builder-core`: the
destination list, the palette, the condition compiler and the property list read
out of the spec's own JSON Schema. Two builders disagreeing about where a field
may go would be two products
([0091](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0091-a-second-builder-is-a-binding.md)).

So is the language it speaks to the person building. A session is opened in one, and
both builders read it from the session:

```ts
import {
  BUILDER_MESSAGES_DE,
  SCHEMA_ERRORS_DE,
  SCHEMA_WORDS_DE,
  createBuilderSession,
  createBuilderText,
} from '@formancy/builder-core'

const session = createBuilderSession(schema, {
  text: createBuilderText({
    locale: 'de',
    messages: BUILDER_MESSAGES_DE,
    schema: SCHEMA_WORDS_DE,
    errors: SCHEMA_ERRORS_DE,
  }),
})
```

Every surface of both builders is then German. A language has three parts: `messages`,
the builder's own words; `schema`, the spec's — a property's title and description, a
field type's name — keyed by the English the spec's JSON Schema writes
([0121](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0121-the-specs-words-are-translated-beside-it.md));
and `errors`, why the validator refused an edit, keyed by the code every validator error
carries beside its English
([0122](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0122-a-validator-error-has-a-code.md)).
French ships as well, as `…_FR`. A parser's message — JSON that does not parse — stays in
its package's words. Anything a language leaves out is English, one message at a time, so
a catalogue of your own can start small.
A session's language is fixed for its lifetime: to change it, open a session again over
the same document
([0114](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0114-the-builder-speaks-the-authors-language.md),
[0120](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0120-a-sessions-language-is-fixed-for-its-lifetime.md)).

Every pane the React builder has, this one has too: the arrangement tree and the drag
surface on the rendered form, the property and logic panels, the translations pane, and
the prompt and scenario panes. This page said otherwise for more than a week after they
shipped — and the arrangement pane offered less than React's until both read their offer
from `builder-core`: it could not place a field the arrangement leaves out, or add a code
([0117](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0117-the-arrangement-pane-offers-the-same-in-both-builders.md)).

## Proof this is not a second implementation

The Angular renderer passes the **same conformance fixtures** as the React one,
driven only by accessible name and role. That suite is what keeps the two from
drifting apart — see [Conformance](/docs/concepts/conformance/).

And you can watch it: the [playground](https://formancy.ai/playground/) renders
one schema under both renderers, side by side, over two engines built from the
same document. Edit the JSON and both follow.

### Two of the same form on one page

Element ids come from the engine, minted from the form's `id`, which is what
makes them deterministic and stable under server rendering. So two engines built
from one schema mint **identical** ids — and a duplicate id does not merely
duplicate: `<label for>` resolves to the first match in the document, so every
control in the second form loses its accessible name.

Pass `formId` when a page shows the same form twice, whether that is two
renderers or two applicants:

```ts
const left = createFormEngine({ schema, formId: 'applicant-1', capabilities })
const right = createFormEngine({ schema, formId: 'applicant-2', capabilities })
```

It changes nothing about the document: the schema is the same schema, its hash is
the same hash, and a submission still binds to the version it was rendered
against. Leaving it out keeps the form's own `id`, which is right for the usual
case of one form on a page.
