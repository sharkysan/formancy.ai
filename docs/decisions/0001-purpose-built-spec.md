# 0001 — Write a new schema spec rather than adopt form.io's

- **Status:** accepted
- **Date:** 2026-09-19
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/spec/formancy.schema.json` closes every object with
  `additionalProperties: false` and pins `specVersion` to `const: "0"`, so a
  foreign document fails validation rather than half-loading;
  `packages/spec/src/validate.test.ts` ("rejects a misspelled property rather
  than ignoring it") fails if the schema is loosened, and
  `packages/spec/src/schema.test.ts` ("offers exactly the field types the types
  module declares") fails if the published JSON Schema and the TypeScript types
  drift apart.

## Context

form.io is the benchmark and the reason the project exists, so adopting its
schema was the first option considered. It would buy an import path: an existing
installation could bring its forms across instead of rebuilding them, which is
the largest single obstacle to anyone switching.

That schema is also where the architecture being escaped is written down.
Presentation and behaviour are mixed into one component document, so a form
cannot have two presentations of the same data. There is no independent version
line, so nothing identifies which contract a stored answer was collected
against. Renames are not declared, so a changed key is indistinguishable from a
removal plus an addition. Nothing specifies what happens to a hidden field's
answer.

Importing those documents means one of two things: importing the semantics with
them, or keeping formancy's semantics and silently changing what an imported
form does. The second is worse. A form whose logic quietly changed on import is
not a broken import that someone notices and reports; it is a form that collects
different data than it used to.

## Decision

A new, purpose-built, versioned spec. No form.io compatibility and no importer —
held as a permanent position rather than deferred to a later release.

## Consequences

**What it buys.** The document could be designed around the properties that
turned out to matter: a version line independent of the packages
([0009](0009-independent-spec-version.md)), a canonical hash that is the
version's identity ([0010](0010-canonical-hash.md)), renames declared in the
document ([0011](0011-declared-renames.md)) and specified semantics for a hidden
field's answer ([0013](0013-hidden-field-semantics.md)). None of the four
retrofits onto a schema that did not plan for it.

**What it costs.** Every prospective migrator rebuilds their forms by hand. That
is the largest adoption cost the project carries, it falls hardest on the people
most motivated to switch, and it is accepted rather than mitigated.

**What it forecloses.** There is no migration-driven route to market. Adoption
has to come from new forms and new projects, and the answer to "can I bring my
existing forms?" is no, permanently.

## Alternatives considered

**Adopt form.io's schema.** Rejected: it encodes the architecture the project
exists to replace, and taking the document means taking its semantics or
altering them in silence.

**A translation layer onto our own spec.** Rejected. The semantics do not
translate. Where the source leaves behaviour unspecified, the layer has to
guess, and a guess in a form's logic is a wrong answer in a database rather than
a visible defect.
