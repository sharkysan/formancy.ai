<!-- Part of formancy: https://github.com/sharkysan/formancy.ai -->

# @formancy/server-core

The formancy backend's use-cases, with no HTTP framework and no database driver
in sight: publish, resolve, submit, drafts, listing, export, and the identity
and authorization model.

Everything talks to a `Storage` port. The same code runs over Postgres in
`@formancy/server` and over a `Map` in tests, which is what makes these
behaviours testable without a database and portable across ones.

## Two load-bearing decisions

**Submission is a replay, not a check.** `createSubmission` rebuilds the engine
from the exact schema version the client says it rendered, runs it over the
submitted data, and stores the *canonical* result: computed values are
recomputed and overwrite whatever arrived, and fields the server evaluates as
hidden are stripped. A client cannot smuggle data into a hidden branch by lying
about what was shown. Client validation is UX; this is truth.

**Nothing ambient.** Identity, time, hashing and randomness are injected. That
is what lets a submission be replayed later and produce byte-identical computed
values — and it is why the auth tests can use deterministic fakes while the real
server gets argon2id and a CSPRNG.

## Use

```ts
import { publishForm, createSubmission, can } from '@formancy/server-core'

const published = await publishForm(deps, { path: 'contact-us', schema })
// publishForm is the save gate: structural validation, then the engine's own
// compile — a form that could loop is refused here and never persisted.

const outcome = await createSubmission(deps, {
  path: 'contact-us',
  declaredSchemaHash: published.schemaHash,
  data: payload,
})
```

Authorization is one readable table (`can(actor, action)`), deliberately not
Postgres row-level security: RLS couples the application to per-request database
roles and hides authorization from the test suite.

Docs: `apps/docs` (Quickstart: self-hosting).
