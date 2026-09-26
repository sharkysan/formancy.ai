---
title: Versioning
description: How published form versions stay immutable, how a submission stays bound to the schema that produced it, and how in-flight drafts migrate.
---

Forms change; submissions already collected must not. Five rules make that work,
and they are the rules that cannot be refactored later — once real data exists,
a mistake here is permanent.

## 1. A published version is immutable

Publishing inserts a new row and moves a pointer. It never rewrites an existing
one. This is enforced by a **database trigger**, not by application discipline:

```sql
UPDATE form_versions SET schema_hash = 'tampered' WHERE version = 1;
-- ERROR: form_versions rows are immutable; publish a new version instead
```

Application code can be bypassed. Every submission's audit story depends on its
schema staying exactly what the person saw, so the guarantee lives where it
cannot be.

## 2. A submission binds by both key and hash

Each submission stores a real foreign key to its version row *and* the version's
`schemaHash`. The key gives joins and referential integrity — with
`ON DELETE RESTRICT`, so orphaning a submission from its schema is structurally
impossible. The hash gives tamper evidence: a hand-edited database row stops
matching.

The hash is a SHA-256 over a **canonical** serialisation, so two documents that
differ only in key order are the same version. That canonicaliser refuses
`undefined`, `NaN` and `Infinity` rather than letting JSON silently drop them —
a dropped field would make two different schemas share one hash.

## 3. Field keys are identity; renames are declared

Covered in [The schema](/docs/concepts/schema/): `renamedFrom` is how an answer
follows a field to a new key. Without it, a key change reads as a delete plus an
add, because that is what it is.

## 4. The client declares what it rendered

Submitting carries the schema hash the client actually rendered:

```
x-formancy-schema-hash: 52b543ef…
```

If the form has been republished since, the server answers
`409 FORM_VERSION_CHANGED` **with the current schema attached**, so the client
can re-render and preserve what it can instead of guessing why it was refused.

## 5. Drafts migrate lazily, never eagerly

An autosaved draft is bound to the version it was written under. When it is
resumed after a republish, `diffSchemas` classifies what changed and the
outcome follows:

| Severity | Examples | What happens |
| --- | --- | --- |
| `compatible` | optional field added, label changed, validation relaxed | rebinds silently |
| `lossy` | field removed, type changed, validation tightened | rebinds **with a report**; removed values move to `data.__orphaned` rather than being deleted; declared renames carry their value across |
| `breaking` | spec version bump | does not rebind; the draft comes back read-only against its own version, with "start over" as the honest option |

Migration is lazy because most drafts are abandoned — migrating eagerly on every
publish multiplies every publish by every draft. A successful rebind is
persisted, so the work happens once rather than on every resume.

**The report is only useful if somebody sees it.** A `lossy` rebind keeps the
answers and takes them off the form, so a host that ignores `migration` leaves
people submitting in the belief that everything they typed is included. See
[Drafts](/concepts/drafts/) for the three calls, why a draft carries a token
rather than an id, and the notice both renderers ship for this.

## Two version lines

**Package versions** move together as one number. Before 1.0, breaking changes
may land in minors and are documented in `MIGRATIONS.md`.

**The spec version** inside each document is independent, because it is the
artifact with real switching costs — your forms and submissions are written
against it. Packages 0.9 and 1.4 can both speak spec `"1"`.

Spec **`"1"` is frozen.** A document that validates today will validate against
every future release that speaks spec 1. It was deliberately shipped as `"0"`
and unstable first, because three things about the model turned out to be
undiscoverable without a renderer and a server in the loop: what happens to a
hidden field's answer, how a repeating-group row keeps an identity that is not
its position, and where a validation check runs. All three are settled, so the
version froze. From here a spec bump is a major event,
`@formancy/cli migrate` rewrites documents forward — and **submissions never
migrate**. They stay bound to the exact version that produced them, which is
what makes an old one auditable at all.

## Seeing the diff yourself

The same function the server uses is exported:

```ts
import { diffSchemas } from '@formancy/spec'

for (const change of diffSchemas(before, after)) {
  console.log(change.severity, change.kind, change.path, change.detail)
  // lossy  field.removed  model.fields.g.child  Removed. Existing values move to …
}
```

It walks **data paths**, not the field list — so a change buried inside a group
or a repeater template is seen, moving a field between pages is no change at
all, and moving one into a group is a removal plus an addition, because the
submission shape really did change.
