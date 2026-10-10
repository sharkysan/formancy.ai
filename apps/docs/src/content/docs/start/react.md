---
title: "Quickstart: React"
description: Render a working formancy form in React with createFormEngine, FormancyProvider and FormancyForm.
---

## Install

```bash
npm install @formancy/react @formancy/core @formancy/spec
```

React 19 is a peer dependency. The packages are ESM-only, so Node 22.12 or
newer and any bundler from the last few years.

:::note[Beta]
The packages are published with provenance — `npm audit signatures` will tell you
which workflow run built one — and their APIs will change before 1.0. The *document
format* is frozen and stays frozen: `specVersion: "1"`, `"2"` and `"3"` all are, and each
later version only adds. A reader **refuses** a document from a version it does not know
rather than ignoring the part it cannot read, so the version a release speaks is worth
checking against the version a document declares — `MIGRATIONS.md` lists both.
:::

### Or from the repository

The playground app is the fastest place to poke at a live form, and the whole
builder is in it. `@formancy/builder-react` is published, so embedding it in
your own application needs no clone — this is the faster way to try it.

```bash
git clone https://github.com/sharkysan/formancy.ai.git
cd formancy.ai
corepack enable pnpm
pnpm install
pnpm build
pnpm --filter @formancy/playground dev
```

## A minimal form

A form is a plain JSON document: a `model` (what the form collects) and
optional `logic` (how it behaves). Display text rides on the model as `label`,
either as a literal string or as a reference into the form's [`i18n`
catalogue](/docs/concepts/schema/#words-i18n).

```tsx
import { useState } from 'react'
import { createFormEngine } from '@formancy/core'
import { FormancyProvider, FormancyForm } from '@formancy/react'
import type { FormSchema } from '@formancy/spec'

const schema = {
  specVersion: '1',
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

One exception, and it is the only one: a control sets the CSS it needs in order
to **work**, never how it looks. The signature surface declares
`touch-action: none` on the element, because a touch drag on a drawing surface is
otherwise resolved as a scroll by the browser before any handler runs — so a
signature drawn with a finger would pan the page instead. Its height, border,
background and cursor are still yours.

## Two of the same form on one page

Element ids come from the engine, minted from the form's `id` — which is what
makes them deterministic and stable under server rendering. Two engines built
from one schema therefore mint **identical** ids, and a duplicate id does not
merely duplicate: `<label for>` resolves to the first match in the document, so
every control in the second form loses its accessible name.

Pass `formId` when one page shows the same form twice:

```ts
const first = createFormEngine({ schema, formId: 'applicant-1', capabilities })
const second = createFormEngine({ schema, formId: 'applicant-2', capabilities })
```

It changes nothing about the document — same schema, same hash, and a submission
still binds to the version it was rendered against. Leave it out for the usual
case of one form on a page and the form's own `id` is used.

The [playground](https://formancy.ai/playground/) does exactly this to show one
schema under the React and Angular renderers at once.

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

## A model's edit, checked against your examples

`@formancy/builder-react` is the builder. Two of its panes belong together: `ScenarioPane`
runs a form's examples after every edit, and `PromptPane` asks your model for a change and
holds the answer for review ([agents](/docs/start/agents/)). Give them the same examples:

```tsx
import { PromptPane, ScenarioPane } from '@formancy/builder-react'

<>
  <PromptPane session={session} ask={askModel} scenarios={scenarios} initialValue={sample} />
  <ScenarioPane
    session={session}
    scenarios={scenarios}
    onChange={setScenarios}
    initialValue={sample}
  />
</>
```

`scenarios`, `initialValue` and `mode` mean the same on both. With them the prompt pane runs
the examples against the form as it is and as the answer would leave it, before anybody
presses Apply. The review's heading names each example that would stop holding, and the
status names those and any that would hold again. Apply stays enabled, because a rule
changed on purpose stops its old example holding. A rule no example pins gets no warning,
and without `scenarios` the review says nothing about examples
([0159](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0159-a-proposal-is-checked-against-the-forms-examples.md)).

A pane drawn under a tab stops its run when the tab changes. To keep a model's turn going
while the person looks elsewhere, hold the run above the tabs with `createPromptRun()` and
pass it as `run` ([agents](/docs/start/agents/)). The translations pane takes a
`createTranslationRun()` as `run`, and the scenario pane a `createDraftRun()` as `drafting`, for
the same reason
([0164](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0164-a-translation-is-held-for-its-language-and-a-draft-for-its-form.md)).

## Examples, drafted from what you say the form should do

A form with no examples gets nothing from either pane. Give `ScenarioPane` a model as well as
`onChange`, and it drafts some:

```tsx
<ScenarioPane
  session={session}
  scenarios={scenarios}
  onChange={setScenarios}
  initialValue={sample}
  ask={askModel}
/>
```

The person says what the form should do, in their own words, and presses *Draft examples*.
The model is shown the form's fields — the path an example names each one by, its type, its
label and its options — the error codes the engine reports, where examples start and those
words. It is never shown a rule, a pattern, a bound or which fields are required: a model
shown the rule writes the example the rule passes, and that example agrees with the rule
whether it is right or wrong.

Each draft is listed with what it sets and expects, and with the engine's verdict on the form
as it is now — run with the pane's own `initialValue` and `mode`, so it is the verdict the
list gives it once kept, recomputed when the form changes.
Nothing reaches `onChange` until *Keep*. A draft that does not hold can be kept: that is the
person saying the example is right and the form is not. A name already in the list, or a
field the form does not have, cannot be kept. Items of the answer that are not examples are
listed with why, and do not cost the rest; a model that declines has its reason quoted. With
a relay as `ask`, the request is carried by hand like the prompt pane's
([agents](/docs/start/agents/)), and the part tells the person to start a new chat for it: a
model that has already seen the form there has seen its rules. One relay for both panes
carries one turn, so whichever asks second is told another request is waiting.
`ScenarioDrafts` is the part on its own, for a host that places it elsewhere
([0162](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0162-an-example-is-drafted-from-what-the-author-said.md)).

Next: [self-host the backend](/docs/start/self-hosting/) and post the form's
submissions to it, or read [how the schema is structured](/docs/concepts/schema/).
