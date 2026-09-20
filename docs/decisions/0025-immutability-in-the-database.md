# 0025 — Enforce version immutability with a database trigger

- **Status:** accepted
- **Date:** 2026-09-19
- **Deciders:** Daniel Bacher
- **Verified by:** the `refuse_version_update()` function and the
  `form_versions_immutable` BEFORE UPDATE trigger created in
  `packages/server/src/db.ts`. The test "the database refuses to mutate a
  published version — immutability is a trigger, not a convention" in
  `packages/server/src/server.integration.test.ts` issues
  `UPDATE form_versions SET schema_hash = 'tampered'` over the raw connection,
  going around the application entirely, and asserts that it throws.

## Context

A published form version must never change. Submissions are bound to it, and an
auditor reading a two-year-old submission needs the schema that actually
produced it, not a later one wearing the same version number.

This is the kind of rule that application code enforces correctly until the day
someone writes a migration script, a maintenance task or a console one-liner.
None of those paths go through the use cases, and all of them are legitimate
work that a competent operator will do. A rule that only holds on the paths
somebody remembered is not a guarantee.

## Decision

Publishing inserts a new `form_versions` row and flips
`forms.current_version_id`. Nothing updates a version row. Immutability is
enforced by a database trigger rather than by application code, so it holds for
every path into the database including the ones nobody thought about.

## Consequences

**What it buys.** The guarantee is as strong as the database, which is the only
component every writer has in common. It also makes the hash in
[0026](0026-bind-by-fk-and-hash.md) meaningful: a stored hash is only tamper
evidence if the row it describes cannot be quietly corrected.

This record belongs to a group of five versioning rules that cannot be
retrofitted once users have production data: immutable versions, binding a
submission by foreign key and hash ([0026](0026-bind-by-fk-and-hash.md)),
declared renames ([0011](0011-declared-renames.md)), the client declaring what
it rendered, and lazy draft migration ([0027](0027-lazy-draft-migration.md)).
Each of them is cheap now and impossible later.

**What it costs.** A genuine mistake in a published version cannot be corrected
in place. The only remedy is publishing a new version, which is the intended
behaviour and is occasionally inconvenient — a typo in a label costs a version
number. Test fixtures must create versions the way production does, through the
publish path, because updating a row is no longer available to them. That is
slightly more ceremony in every test that needs two versions.

## Alternatives considered

**Enforcing it in the use cases.** Rejected. `publishForm` is the only writer
today, and that is exactly the assumption that stops being true under
maintenance work, backfills and support access.

**A revoked or `frozen` flag checked by the application.** Rejected for the same
reason, with the added defect that the enforcement lives one indirection away
from the data it protects and can be disabled by the same one-liner it is meant
to stop.
