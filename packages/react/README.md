<!-- Part of formancy: https://github.com/sharkysan/formancy.ai -->

# @formancy/react

The React binding for formancy: hooks over the engine's snapshot protocol, plus
unstyled components you can keep or replace entirely.

Requires React 19.

## The load-bearing decision

`useField` binds through `useSyncExternalStore` against identity-stable engine
snapshots. The consequence is the headline: **typing in one field does not
re-render its siblings** — there is a test that counts renders to keep it that
way. The third argument serves SSR from the same snapshot the client hydrates
with, and because the engine's ids are deterministic, the markup matches.

The second is that markup belongs to you. Prop getters carry every id and ARIA
attribute, so a design system can render every element itself and still be
correct:

```tsx
const field = useField('email')
<label {...field.labelProps}>Email</label>
<input {...field.controlProps} value={field.value as string} />
```

## Use

```tsx
import { FormancyProvider, FormancyForm, ErrorSummary } from '@formancy/react'

<FormancyProvider engine={engine}>
  <ErrorSummary />
  <FormancyForm onSubmit={(outcome) => console.log(outcome)} />
</FormancyProvider>
```

`FormancyForm` renders pages, repeaters and a submit control from the schema.
Swap any field renderer through the registry — per-path beats per-type beats the
built-in defaults — without forking anything.

Also exported: `useRepeater`, `useWizard`, `useSubmit` (which moves focus to the
first problem, or defers to a mounted `ErrorSummary`).

This renderer passes the shared conformance suite; so does the Angular one.

Docs: `apps/docs` (Quickstart: React).
