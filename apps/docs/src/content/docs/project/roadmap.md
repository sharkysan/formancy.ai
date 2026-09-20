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

**The builder's document engine** (`@formancy/builder-core`) — schema editing as
commands with undo/redo and valid-target computation, where a command that would
produce an invalid document is refused rather than applied, and a rename
declares `renamedFrom` so collected answers follow the field.

**The backend** (`@formancy/server`) — Fastify and Postgres: publish with the
engine as the save gate, submissions replayed server-side and stored canonical,
drafts with lazy migration, submissions listing, CSV export unioned across
versions, and a management plane behind sessions, API keys and role-based
authorization.

**Two apps** — a playground (schema, live form and engine state side by side)
and the self-hosted admin (schema editor with live preview, publish, version
history, submissions).

## What does not exist yet

- **The drag-and-drop builder UI.** Its headless half exists
  (`@formancy/builder-core`: commands, undo/redo, valid-target computation);
  the canvas and palette do not. Deliberately sequenced that way — a
  half-finished builder UI gets compared to products with a decade of polish,
  while the hard part is the document engine underneath it. The admin ships a
  schema editor in the meantime.
- **File uploads**, webhooks and form actions.
- **OIDC / SAML.** Local users and API keys only for now.
- **Rate limiting, anonymous-submission hardening, audit logging.**
- **Multi-tenancy, PDF output, e-signatures, analytics.**
- **A Vue renderer.** The engine protocol is designed for one; it is not a
  commitment yet.

Reserved names exist in the spec for several of these (`file`, async
validators, remote option sources), so adding them later is a compatible change
rather than a breaking one.

## What comes next

Roughly in order, and subject to change:

1. **`i18n` and `layout` sections** in the spec, replacing the v0
   presentation-lite properties — after which the spec can freeze to `"1"`.
2. **The builder UI** over the existing document engine. Its commands are
   already keyboard-shaped — insert, move, remove, rename — because WCAG 2.2
   requires every drag operation to have a non-drag alternative, and building
   the drag layer first is how that alternative ends up unfinished.
3. **Files and actions**, with the storage abstraction and webhook delivery
   already designed.
4. **Hardening the public plane**: rate limits, a challenge, origin allowlists.
5. **A published docs site and npm releases.**

## Versioning promises

Pre-1.0, breaking changes may land in minor releases and are documented in
`MIGRATIONS.md`. The spec version is separate from package versions and is the
one we treat as load-bearing. Submissions never migrate — see
[Versioning](/concepts/versioning/).

## Contributing

The contributor agreement policy is not settled yet, and the repository is not
open to outside contributions until it is — deliberately, because that choice
cannot be made retroactively. `GOVERNANCE.md` says so plainly rather than
leaving a well-meant pull request to be refused later.
