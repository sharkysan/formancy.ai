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

### The form's own words, in its language

The questions are yours. The words around them — Next, Back, Submit, a repeater's Add and
Remove and which row a button acts on, the error summary's heading, and what a field
announces while a file is sent or a list is searched — are the renderer's, and they are in
the language the questions are read in: the engine's locale when the document has a catalogue
for it, and the document's default when it has not — never the browser's. Build the engine
with `locale: 'de'` and the buttons are German; English, German and French ship.

A language that does not ship, or a word you want said differently, is yours to give, by
locale, a message at a time — anything you leave out is English. English is a language like
the others: `en` changes it, on a form with no catalogue too.

```ts
provideFormancy(engine, {
  words: {
    it: { 'form.next': 'Avanti', 'form.back': 'Indietro', 'form.submit': 'Invia' },
    de: { 'form.submit': 'Senden' },
    en: { 'form.submit': 'Send' },
  },
})
```

Every id, with its English, is `FORM_WORDS` in `@formancy/core/words`; `FORM_WORDS_DE` and
`FORM_WORDS_FR` are the shipped translations. Your own words still win where you gave them:
`[submitLabel]` names the submit button, and a repeater's `addLabel` and `removeLabel` in
the document name its buttons. A component of your own — a registry's control, say — reads
the same words with `injectFormText()`, or in its template with the `formancyText` pipe,
`{{ 'form.next' | formancyText }}`, which Material's groups use too. `formancy-resume-notice`
speaks the form's language under the form's `provideFormancy`, and English outside it. Two
things are not the renderer's to translate: a field's error is the engine's code, such as
`required`, and `addLabel` is a plain string in one language
([0171](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0171-the-renderers-words-are-the-forms-language.md)).

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

Include a Material theme as you would for any Material component, and load the Roboto face its
type tokens name — they name it with no fallback, so without it every label is drawn in the
browser's serif. The adapter ships no CSS. The fieldset around a group of radios or ticks is the
adapter's own markup, and carries the same `data-formancy-part` hooks as the default group's, so
one stylesheet reaches both.
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

**Put the calendar button back.** Material's stylesheet hides Chromium's own calendar and clock
buttons on every `matInput`, because its datepicker brings a toggle of its own — so in Chrome
and Edge a date or a time drawn by this adapter can only be typed. Firefox keeps its button,
so the fix is to restore Chromium's rather than add one, in your stylesheet after Material's
theme:

```css
.mat-mdc-form-field input[type='date']::-webkit-calendar-picker-indicator,
.mat-mdc-form-field input[type='time']::-webkit-calendar-picker-indicator {
  display: block;
}
```

The starter below does, and `test:browser` checks that its date field shows the button
([0149](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0149-a-material-date-keeps-the-platforms-calendar-button.md)).

It is held to the same conformance fixtures as the default controls, through the same driver,
axe audit included ([0132](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0132-material-draws-what-it-has-an-equivalent-for.md)).

**A whole application to start from** is in the repository:
[`apps/angular-starter`](https://github.com/sharkysan/formancy.ai/tree/main/apps/angular-starter) —
the Angular builder and the form it builds side by side, drawn with Material, with the
document, the panels, the submit, the uploader and where the form is saved each in one file
of their own. Its stylesheet shows the rest of the page in Material's tokens: the builder
dressed by `@formancy/themes/workbench.css` with Material's colours, and the controls Material
does not draw — the submit button, a repeater, a file — dressed through their hooks. It saves the form being built and opens on it next time, and
[formancy.ai/angular-form-builder](https://formancy.ai/angular-form-builder/) runs it.

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

### Blocks: a piece of a form, saved to use again

Bind `blocks` and the add palette offers them beside the field types, and `b` saves the
focused field — usually a group or a repeater — as a new one, handed to you through
`blockSaved`:

```ts
@Component({
  imports: [FormancyBuilder],
  template: `
    <formancy-builder
      [session]="session"
      [blocks]="blocks()"
      (blockSaved)="keep($event)"
    />
  `,
})
export class Editor {
  protected readonly session = createBuilderSession(schema)
  protected readonly blocks = signal<readonly BuilderBlock[]>([])

  protected keep(block: BuilderBlock): void {
    this.blocks.update((kept) => [...kept, block])
  }
}
```

A block is plain data — the field, the rules that read only inside it, and the words its
labels name — so keep it wherever you keep forms. **Storing them is yours**: binding the list
is how the builder knows you do, and without it `b` is not a command. In React it is the
same pair as props, `blocks` and `onSaveBlock`.

Inserting one is a rename and a move at once. A key the form already uses becomes
`country2`, a word id it says differently becomes `title2`, and every rule the block
carries follows its keys to where it lands — so an address's canton still shows only for
Switzerland. A rule that reads a field outside the block cannot travel, and saving says how
many stayed behind. A block is a copy, not a reference: changing it later changes no form
that used it
([0135](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0135-a-block-is-a-field-with-its-rules.md)).

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

### A model's edit, checked against your examples

Bind the prompt pane to the same examples as the scenario pane, and a model's answer is run
against them before anybody presses Apply:

```ts
@Component({
  imports: [FormancyPromptPane, FormancyScenarioPane],
  template: `
    <formancy-prompt-pane
      [session]="session"
      [ask]="ask"
      [scenarios]="examples"
      [initialValue]="sample"
    />
    <formancy-scenario-pane [session]="session" [scenarios]="examples" [initialValue]="sample" />
  `,
})
export class Editor {
  protected readonly session = createBuilderSession(schema)
  protected readonly ask = askModel
  // The form's examples and the sample they start from, kept wherever you keep the form.
  protected readonly examples: readonly Scenario[] = EXAMPLES
  protected readonly sample = SAMPLE
}
```

`scenarios`, `initialValue` and `mode` mean the same on both panes. The review's heading
names each example the answer would stop holding, and the status names those and any it
would make hold again. Apply stays enabled, because a rule changed on purpose stops its old
example holding. A rule no example pins gets no warning, and without `scenarios` the review
says nothing about examples. In React the same three are props on `PromptPane`
([0159](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0159-a-proposal-is-checked-against-the-forms-examples.md)).

A pane that is destroyed stops its run — under an `@if` for a tab, say. To keep a model's
turn going while the person looks elsewhere, hold the run where the pane's host lives with
`createPromptRun()` and bind it as `[run]`
([0163](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0163-a-models-run-belongs-to-the-host.md)).
The translations pane takes a `createTranslationRun()` as `[run]`, and the scenario pane a
`createDraftRun()` as `[drafting]`, for the same reason
([0164](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0164-a-translation-is-held-for-its-language-and-a-draft-for-its-form.md)).

### Examples, drafted from what you say the form should do

Bind a model to the scenario pane as well, with `removable` set and its output handled, and
it drafts examples for a form that has none:

```html
<formancy-scenario-pane
  [session]="session"
  [scenarios]="examples()"
  [initialValue]="sample"
  [removable]="true"
  [ask]="ask"
  (scenariosChange)="examples.set($event)"
/>
```

The model is shown the form's fields — paths, types, labels and options — the engine's error
codes and the person's words, and never a rule, a pattern, a bound or which fields are
required, because a model shown the rule writes the example the rule passes. Each draft is
shown with the engine's verdict on the form as it is now, run with the pane's `[initialValue]`
and `[mode]`, which is the one the list gives it once kept. Nothing is emitted until *Keep*. A
draft that does not hold can be kept, and a name already taken or a field the form does not
have cannot. A model that declines has its reason quoted. Through a relay the part tells the
person to start a new chat for the request, since a model that has already seen the form
there has seen its rules; and one relay asked from two panes carries one turn, so whichever
asks second is told another request is waiting. `formancy-scenario-drafts` is the part on its
own. In React the same is `ask` on `ScenarioPane`
([0162](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0162-an-example-is-drafted-from-what-the-author-said.md)).

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
