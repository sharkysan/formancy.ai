<!-- Part of formancy: https://github.com/sharkysan/formancy.ai -->

# @formancy/spec

The formancy form schema: its TypeScript types, its JSON Schema, a validator,
a canonical content hash, and a diff that classifies what a change costs the
data already collected.

This package has no dependencies on any framework, on Node or on the DOM. The
same build runs in a browser, in a server and in a build script.

## Two load-bearing decisions

**The canonical hash is the version's identity.** `schemaHash(schema)` is a
SHA-256 over a canonical serialisation, so two documents differing only in key
order are the same version. `canonicalize` refuses `undefined`, `NaN` and
`Infinity` rather than letting `JSON.stringify` drop or coerce them — a dropped
field would make two different schemas share a hash, which would quietly break
the tamper evidence every submission relies on.

**`diffSchemas` classifies by cost, over data paths.** Every change is
`compatible`, `lossy` or `breaking`, and the walk follows data paths rather than
the field list: a change inside a group or a repeater template is seen, moving a
field between wizard pages is no change at all, and moving one into a group is a
removal plus an addition — because the submission shape really did change. A key
that changes without a declared `renamedFrom` is reported as remove-plus-add
rather than guessed at; guessing wrong silently moves one field's answers into
another field.

## Use

```ts
import { schemaHash, diffSchemas, modelDataPaths } from '@formancy/spec'
import { validateSchema } from '@formancy/spec/validate'

const result = validateSchema(document)
if (!result.valid) {
  for (const error of result.errors) console.log(error.path, error.message)
}

for (const change of diffSchemas(published, draft)) {
  console.log(change.severity, change.kind, change.path)
}
```

`validateSchema` lives behind its own subpath because it pulls in ajv, and the
renderers import this package only for types and hashing. The validator itself
is **precompiled at authoring time** — compiling at runtime would reach for
`new Function`, which throws under the strict no-`unsafe-eval` policy the
browser-embedded builder runs under.

Docs: `apps/docs` (Concepts → The schema).
