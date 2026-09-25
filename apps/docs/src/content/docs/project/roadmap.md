---
title: Roadmap and status
description: What exists in formancy today, what is deliberately missing, and what comes next.
---

Written to be honest rather than encouraging. Everything under "what exists" is
covered by tests in the repository; everything under "what does not" is absent,
not partial.

## What exists

**The spec** (`@formancy/spec`) — the versioned form document, its JSON Schema,
a validator whose messages are written for form authors, a canonical content
hash, and `diffSchemas` with a compatible / lossy / breaking severity model.

**Expressions** (`@formancy/expressions`) — CEL behind our own
parse / check / compile / evaluate interface, with structural and runtime
limits, per-kind function allow-lists, injected capabilities, and an exact
decimal type for money.

**The engine** (`@formancy/core`) — one build that runs in a browser and in
Node: the reactive graph, conditional visibility, computed values, row-scoped
rules inside repeaters, model validators, wizard semantics, identity-stable
snapshots, and engine-minted accessibility ids.

**Two renderers** — `@formancy/react` (hooks, unstyled components, error
summary) and `@formancy/angular` (signals, zoneless, DI registry). Both pass the
same conformance fixtures.

**The conformance suite** (`@formancy/conformance`) — published, so third-party
renderers can self-certify.

**The builder** (`@formancy/builder-core` and `@formancy/builder-react`) —
schema editing as commands with undo/redo and valid-target computation, where a
command that would produce an invalid document is refused rather than applied,
and a rename declares `renamedFrom` so collected answers follow the field. Over
that: a structure tree, an arrangement tree for rows and columns, a field
palette, a property panel generated from the spec's own JSON Schema, and a
condition editor that compiles to CEL — all keyboard-driven, each with a drag
surface added afterwards as a second route to the same commands. Rows and
columns can also be dragged on the rendered form itself.

**The backend** (`@formancy/server`) — Fastify and Postgres: publish with the
engine as the save gate, submissions replayed server-side and stored canonical,
drafts with lazy migration, submissions listing, CSV export unioned across
versions, a management plane behind sessions, API keys and role-based
authorization, per-IP rate limiting and per-form origin allowlists on the
public plane, and webhooks delivered from a transactional outbox to an address
the server resolved and checked itself.

**Two apps** — a playground (schema or builder, live form and engine state side
by side, with theme and language switchers) and the self-hosted admin (the
builder in a three-pane inspector, a raw schema editor, publish, version
history, submissions and export).

## What does not exist yet

- **A pointer gesture that creates a row.** You add one and move fields into
  it. Dropping *between* two elements rather than onto one would need gap
  targets the renderers do not emit.
- **Conditions combining more than one comparison** in the builder's editor.
  The expression language handles them; the authoring UI does not yet, and you
  can still write the CEL directly.
- **Virus scanning** of uploaded files, and **resumable uploads**. Files
  themselves work; a stored file is trusted the moment its bytes land, and the
  deployment's byte ceiling is also the largest single file.
- **An S3 file store.** Local disk is the only one, and it does not survive
  more than one replica.
- **Form actions** beyond webhooks.
- **A per-action circuit breaker and dead-letter replay.** A dead delivery is
  kept and findable, but re-queueing one is a SQL statement.
- **OIDC / SAML.** Local users and API keys only for now.
- **A proof-of-work challenge** on the public plane. The rate limit and the
  origin allowlist stand in for it.
- **Audit logging.**
- **Multi-tenancy, PDF output, e-signatures, analytics.**
- **A Vue renderer.** The engine protocol is designed for one; it is not a
  commitment yet.

Field **type names** for several of these are reserved — `file`, `datetime`,
`multiselect` and the rest are simply absent from the type list, and adding a
value to that list is a compatible change.

Rule-level properties are **not** reserved, and this is a real gap: `runsOn`
and `async` were meant to be, but `logicRule` is `additionalProperties: false`,
so a document carrying either would be rejected today. Adding them is therefore
a spec version bump, not an additive change — which is worth settling before
the spec freezes rather than after.

## What comes next

Roughly in order, and subject to change:

1. **Files and actions**, with the storage abstraction already designed and
   webhook delivery already built.
2. **A per-action circuit breaker and dead-letter replay in the admin.**
   Self-hosters have no operations team watching a dashboard, so a failing
   receiver has to be visible in the product rather than in a table.
3. **A proof-of-work challenge** on the public plane, to sit alongside the rate
   limit and the origin allowlist.
4. **Audit logging**, written in the same transaction as the mutation.
5. **A published container image**, signed, alongside the npm releases.

## Versioning promises

Pre-1.0, breaking changes may land in minor releases and are documented in
`MIGRATIONS.md`. The spec version is separate from package versions and is the
one we treat as load-bearing. Submissions never migrate — see
[Versioning](/docs/concepts/versioning/).

## Contributing

The contributor agreement policy is not settled yet, and the repository is not
open to outside contributions until it is — deliberately, because that choice
cannot be made retroactively. `GOVERNANCE.md` says so plainly rather than
leaving a well-meant pull request to be refused later.
