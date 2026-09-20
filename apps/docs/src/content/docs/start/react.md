---
title: "Quickstart: React"
description: Render a working formancy form in React with createFormEngine, FormancyProvider and FormancyForm.
---

:::note
`@formancy/react` is **not yet published to npm**. To try it today, clone the
repository and work inside the monorepo — the playground app
(`apps/playground`) is the fastest place to poke at a live form.
:::

## Set up the repository

You need Node >= 22.12 and pnpm (via corepack).

```bash
git clone https://github.com/sharkysan/formancy.ai.git
cd formancy.ai
corepack enable pnpm
pnpm install
pnpm build
```

## A minimal form

A form is a plain JSON document: a `model` (what the form collects) and
optional `logic` (how it behaves). Display text rides on the model as `label`
for now — that is version-0 presentation-lite, superseded by a dedicated `i18n`
section at spec v1.

```tsx
import { useState } from 'react'
import { createFormEngine } from '@formancy/core'
import { FormancyProvider, FormancyForm } from '@formancy/react'
import type { FormSchema } from '@formancy/spec'

const schema = {
  specVersion: '0',
  id: 'contact-us',
  title: 'Contact us',
  model: {
    fields: [
      { key: 'name', type: 'text', label: 'Your name', required: true },
      { key: 'email', type: 'text', label: 'Email address', format: 'email', required: true },
      {
        key: 'reason',
        type: 'select',
        label: 'Reason for contact',
        options: [
          { value: 'question', label: 'A question' },
          { value: 'invoice', label: 'A problem with an invoice' },
        ],
      },
      { key: 'invoiceNumber', type: 'text', label: 'Invoice number' },
    ],
  },
  logic: {
    rules: [{ target: 'invoiceNumber', kind: 'visible', cel: 'reason == "invoice"' }],
  },
} satisfies FormSchema

export function ContactForm() {
  // One engine per form instance, created once and kept for its lifetime.
  const [engine] = useState(() =>
    createFormEngine({
      schema,
      capabilities: {
        now: () => Date.now(),
        today: () => new Date().toISOString().slice(0, 10),
        random: () => Math.random(),
      },
    }),
  )

  return (
    <FormancyProvider engine={engine}>
      <FormancyForm
        onSubmit={(outcome) => {
          if (outcome.ok) console.log('canonical value', outcome.data)
        }}
      />
    </FormancyProvider>
  )
}
```

`FormancyForm` renders every field through unstyled built-in components (zero
CSS; style them via the `data-formancy-part` attributes), shows validation
errors once a field has been touched, and hides `invoiceNumber` until the
reason is `"invoice"`. When a rule hides a field, its answer is removed from
the value by default (`clearOnHide`), so a hidden branch cannot smuggle data
into the submission.

## Why `capabilities` is required

The engine never reads an ambient clock or random source. `now()`, `today()`
and `random()` in expressions are **injected** through the `capabilities`
option, and the engine refuses to start without one when the schema has logic
rules.

This is not ceremony. The server replays every submission through the same
engine to recompute calculated values and strip hidden branches — and a replay
is only meaningful if the same expression over the same values produces the
same result, byte for byte. A clock read inside the engine would make that
impossible, so the clock is handed in from outside: `Date.now` in the browser,
one pinned clock per request on the server. Each capability is drawn **once per
evaluation pass** and frozen, so a form with fifty computed fields agrees with
itself about what time it is.

## Bring your own markup

`useField` binds one field and re-renders exactly when that field's snapshot
changes — the engine's snapshots are identity-stable, which is what lets
`useSyncExternalStore` work without memoisation. The binding carries prop
getters with all the ARIA wiring precomputed:

```tsx
import { useField } from '@formancy/react'

function EmailField({ path, label }: { path: string; label: string }) {
  const field = useField(path)
  if (!field.visible) return null
  return (
    <div>
      <label {...field.labelProps}>{label}</label>
      <input
        type="email"
        {...field.controlProps}
        value={typeof field.value === 'string' ? field.value : ''}
        onChange={(event) => field.setValue(event.target.value)}
        onBlur={() => field.touch()}
      />
      {field.touched && field.errors.length > 0 ? (
        <p {...field.errorProps}>{field.errors.join(', ')}</p>
      ) : null}
    </div>
  )
}
```

Register it for one path — or for a whole type — and `FormancyForm` will use it
instead of the default:

```tsx
<FormancyForm registry={{ byPath: { email: EmailField } }} />
```

Per-path entries beat per-type entries beat the built-in defaults. A design
system replaces the entire visual layer by handing in a registry, without
forking anything.

## The rest of the hook family

- `useRepeater(path)` — row count, `addRow`, `removeRow` for a repeater.
- `useWizard()` — page state and `next`/`back`/`goTo` for a paged form; `next`
  validates only the current page, submit validates everything.
- `useSubmit()` — returns a submit function producing `{ ok, errors }`.
- `<ErrorSummary />` — the errors a user should currently see (touched and
  invalid), in document order.

Note that `errors` on a field are **codes** (`"required"`, `"minLength"`,
`"pattern"`…), not sentences: message text belongs to your message catalog, not
to the engine.

Next: [self-host the backend](/start/self-hosting/) and post the form's
submissions to it, or read [how the schema is structured](/concepts/schema/).
