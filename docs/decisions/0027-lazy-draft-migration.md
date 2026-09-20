# 0027 — Migrate drafts lazily on resume, never eagerly

- **Status:** accepted
- **Date:** 2026-09-20
- **Deciders:** Daniel Bacher
- **Verified by:** three tests in `packages/server-core/src/use-cases.test.ts`
  cover the severities by name: "a compatible republish rebinds the draft
  silently", "a lossy republish rebinds with a migration report, orphaning
  rather than deleting", and "a breaking republish returns the draft read-only
  against its original version". The HTTP path is covered by "autosave,
  republish, resume: the draft migrates lazily with a report" in
  `packages/server/src/server.integration.test.ts`. That drafts are never
  migrated eagerly is not mechanically enforced: `publishForm` simply does not
  touch them, and nothing fails if someone makes it.

## Context

A saved draft was written against a version that may since have been
superseded. The obvious answer is to migrate every stored draft when the form is
published, which is a batch job over other people's half-finished work, running
at the moment the author is least able to supervise it, and not undoable.

## Decision

Drafts migrate on resume, one at a time, driven by the severity that
`diffSchemas` ([0015](0015-diff-before-server.md)) reports. Compatible: rebind
to the current version silently. Lossy: rebind, return a migration report, and
move data belonging to removed fields into `data.__orphaned`, where it is never
deleted. Breaking: the draft stays read-only against its original version, with
an explicit option to start over.

The `__orphaned` rule is the one that matters. Answers a person typed are not
discarded because the form changed; they move somewhere recoverable. Declared
renames ([0011](0011-declared-renames.md)) carry their values across first, so a
key change is not mistaken for a removal.

## Consequences

**What it buys.** Publishing stays a cheap, local operation whatever the draft
population looks like, and most drafts — which are abandoned — are never
migrated at all. A successful rebind is persisted, so the work happens once per
draft rather than on every resume.

**What it costs.** Drafts accumulate across versions, so the resume path must
keep handling every severity forever. It cannot assume recent data, and a draft
written three versions ago is a case that has to keep working rather than one
that ages out. Orphaned data persists indefinitely by design, which is a
retention question a deployment has to answer for itself; formancy does not
delete it, which means formancy cannot promise it is gone.

## Alternatives considered

**Eager migration on publish.** Rejected: unbounded work at publish time, over
user data, with no undo.

**Discarding stale drafts.** Rejected. It is simple and it is correct in the
narrow sense that a draft has no guaranteed lifetime, but it throws away typed
answers to make the server's bookkeeping easier.
