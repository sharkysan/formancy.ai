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

:::note[Pre-alpha]
`0.1.0` is on npm with provenance, but the package APIs will change before 1.0.
The *schema* is frozen at `specVersion: "1"`; the code around it is not.
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
overrides. When styling is not enough, provide your own components through the
registry token — per-path beats per-type beats the defaults:

```ts
import { FORMANCY_REGISTRY } from '@formancy/angular'

providers: [
  provideFormancy(engine),
  { provide: FORMANCY_REGISTRY, useValue: { byType: { text: MyTextField } } },
]
```

## Proof this is not a second implementation

The Angular renderer passes the **same conformance fixtures** as the React one,
driven only by accessible name and role. That suite is what keeps the two from
drifting apart — see [Conformance](/docs/concepts/conformance/).
