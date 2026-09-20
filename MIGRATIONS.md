# Versioning and migration policy

## Two version lines, on purpose

**Package versions** (`@formancy/*`) move together as one number. Before 1.0,
breaking changes may land in minor releases; every one is documented here with
what changed, why, and how to move.

**The spec version** (`specVersion` inside every form document) is independent
of package versions, because it is the artifact with real switching costs:
your forms and your submissions are written against it. Packages 0.9 and 1.4
can both speak spec `"0"`.

## Spec version 0 is UNSTABLE

Spec `"0"` may change shape between package releases while the model is being
falsified against real renderers. It freezes to `"1"` when the Angular renderer
passes the full conformance suite — the moment the schema has proven it is not
shaped like any single framework.

From spec `"1"` on:

- a spec version bump is always a MAJOR event, announced ahead of time,
- `@formancy/cli migrate` rewrites documents from version N to N+1 — schemas
  are data, so the migrator is cheap to provide and it is the single strongest
  trust signal we can offer,
- submissions never migrate: they stay bound to the exact form version that
  produced them, forever. That binding is what makes an old submission
  auditable, and no upgrade may touch it.

## Known pre-1.0 caveats

- The version-0 presentation-lite properties (`label`, `options`, `minItems`,
  `maxItems`, `addLabel`, `removeLabel`) are superseded by the spec's `i18n`
  and `layout` sections at spec v1. The migrator will move them.
- The server thin slice ships without authentication and says so loudly in the
  route comments. Do not deploy it anywhere public before the auth work lands.
