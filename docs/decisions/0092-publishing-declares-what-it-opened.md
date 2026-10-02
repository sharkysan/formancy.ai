# 0092 — Publishing declares what it opened, and declaring is optional

- **Status:** accepted
- **Date:** 2026-10-02
- **Extends:** [0025](0025-immutability-in-the-database.md), which makes a published
  version immutable and is the reason this is a *lost notice* rather than lost work, and
  the submission path's stale-version refusal, which this reuses verbatim
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/server-core/src/use-cases.test.ts`, *'two people editing one
  form'* — six cases: a publish that declares nothing still publishes, one that declares
  the current version is accepted, one that declares a replaced version is refused, the
  refusal carries the current schema and version, republishing the identical document stays
  idempotent **declared or not**, and a first publish that declares a base is refused.
  Observed failing before `basedOnSchemaHash` existed. `server.integration.test.ts` asserts
  the route answers `409 FORM_VERSION_CHANGED` against real PostgreSQL, and
  `apps/admin/src/workspace.test.tsx` asserts the builder sends the header and renders the
  version that won. `apps/docs/src/claims.test.ts` reads both outcome unions and fails if
  the roadmap goes back to asking for this.

## Context

form.io sells this as *collision control*. The mechanism was already here, and pointed the
other way.

A **submission** declares the version it was rendered against in `x-formancy-schema-hash`,
and a stale one is refused with `version_changed` carrying the current schema, so the client
re-renders rather than guesses ([0026](0026-bind-by-fk-and-hash.md)).

**Publishing declared nothing.** Two people open the same form in the builder, both press
publish, and the second silently wins. No error, no diff, nothing saying anybody else had it
open. Because a published version is immutable, the first editor's work is not destroyed —
their document is still version 4, readable, and every submission bound to it still resolves.
What is lost is that *anybody noticed*: `forms.current_version_id` moved past it, and the
first editor's next page load shows somebody else's form with no explanation.

That makes this a smaller defect than it first looks and a worse one to leave: the data is
safe, so nothing ever surfaces to prompt the question.

## Decision

**`publishForm` takes an optional `basedOnSchemaHash`, and refuses with `version_changed`
when it does not match what is current.** The route answers 409 with the same error name and
the same body shape the submission path sends, so a client that already handles one stale
version handles both.

**Optional is the decision, not an omission.** A script, the CLI and an agent publish a
document they *composed*, not one they *opened*; they have no version to declare and nothing
to collide with. Requiring the header would make every one of them read the current version
first to satisfy a rule about editors — a round trip bought with nothing. What declares is
the thing that opened a version: the builder. Declaring is how a client **asks** to be told
it has been overtaken.

**The check happens after the idempotent case, and that order is load-bearing.** An editor
whose document already hashes to what is published has nothing to merge — somebody else
wrote exactly what they were going to write. Refusing there would tell them to resolve a
conflict with themselves, and would make a repeated deploy manufacture versions.

**A base declared for a form that has none is refused too.** An editor claiming to have
opened a version of a form this deployment never published is working from a deleted path or
the wrong instance; publishing anyway would make their document version 1 of a form they
believe already has a history.

## Consequences

**The 500 that was hiding behind this got a name.** `UNIQUE (form_id, schema_hash)` is what
makes republishing the current document idempotent rather than a version factory, and it
refuses an *older* document just as firmly — so republishing version 3 to undo a bad version
4 raised at the insert and the route answered **500**. That is now `already_published`,
answered 409 with the version it already is, which is also the honest answer: a published
version is immutable and cannot be published twice.

**Three files moved so the size budget did not have to drift.** `publishing.ts` came out of
`use-cases.ts` (916 → 663 lines), the publish route out of `app.ts` (988 → 928) as a Fastify
plugin, and the header name into `headers.ts` where both routes read it — two spellings of
one header is a bug nobody sees until a client sends the other one. Both ceilings in
`apps/docs/src/size.test.ts` were lowered to the new numbers, which is the ratchet working
as intended: the budget refused the growth and named the seam.

**It does not merge.** The refusal carries the current schema so an editor can *see* what
changed; deciding what to keep is still a person's job. A three-way merge of two form
documents is a real feature and a much larger one, and it is not needed to stop the silent
overwrite.

## Alternatives considered

**Require the header on every publish.** Rejected: see above — it taxes every non-interactive
publisher to protect a case only the builder can be in, and the tax is a round trip.

**Compare version numbers instead of hashes.** Rejected because the hash is already the
currency of this system: the submission path uses it, `form_versions` is unique on it, and it
is canonical over the document rather than over an insert order. A version number also cannot
express *"this is the same document"*, which is what the idempotent case needs.

**Lock the form while somebody has it open.** Rejected. A lock needs a holder, a lease and an
expiry, and a self-hosted deployment with no ops team gets a form nobody can publish because
a browser tab closed. Optimistic concurrency fails only at the moment of writing, and tells
the loser what won.

**Refuse before the idempotent check**, which is simpler to read. Rejected: it makes two
editors who wrote the identical document conflict, and makes a repeated deploy — the same
schema pushed by CI twice — a conflict rather than a no-op. The test for this names the order
as the whole of the case.
