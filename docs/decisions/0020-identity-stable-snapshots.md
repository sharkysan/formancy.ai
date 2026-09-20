# 0020 — Make snapshot identity the reactivity contract

- **Status:** accepted
- **Date:** 2026-09-19
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/core/src/engine.test.ts` — "snapshots are
  identity-stable: an untouched field keeps the same snapshot object",
  "touching a field changes only that field snapshot" and "subscribeField wakes
  exactly the fields whose snapshot changed"; `packages/core/src/store.test.ts`
  — "transact coalesces several writes into one notification carrying every
  changed path" and "a set that changes nothing notifies nobody and does not
  bump the version".

## Context

The engine has to drive two reactivity systems that work differently. React's
`useSyncExternalStore` compares the object returned by `getSnapshot` by
identity: a store that hands back a fresh object each call tears, or loops.
Angular 22's zoneless OnPush change detection wants a signal per field that is
set only when that field actually changed, because there is no zone to fall
back on. A store designed for one of those would be wrong for the other, and an
event-emitter-shaped store — `on('change', path)` — would be wrong for both,
since every consumer would then have to memoise its own view of the state.

## Decision

`getFieldSnapshot(path)` returns a frozen object whose *identity* changes only
when that field's observable state actually changes: value, visibility,
requiredness, disabled state, touched state or errors. Snapshots are cached per
wire path, and the cache entry is deleted precisely when one of those changes.

## Consequences

**What it buys.** Both bindings collapse to the same few lines.
`packages/react/src/use-field.ts` passes `engine.getFieldSnapshot` straight to
`useSyncExternalStore` with no memoisation, and
`packages/angular/src/field.ts` sets a signal from the same subscription, where
`set` is a real change exactly when the field changed. Writes coalesce
underneath: the value store commits a transaction once and notifies once with
the set of paths actually written, so a transaction touching twenty fields
wakes each affected field a single time.

It is also why the locale is fixed for the engine's lifetime
([0014](0014-presentation-sections.md)). Labels are resolved into the snapshot,
and a locale that could move under the cache would leave every cached snapshot
stale with no event to invalidate it. Switching language means building a new
engine.

**What it costs.** Every piece of state a renderer reads has to be part of the
snapshot *and* part of the invalidation rules. State that is added without
being wired into invalidation is silently stale — a failure mode that is easy
to introduce and hard to see, because nothing throws and the first symptom is a
field that does not update. That is why the conformance suite
([0033](0033-one-suite-n-drivers.md)) reads state through the rendered DOM
rather than through the engine: asking the engine would ask the thing that is
wrong.

## Alternatives considered

**An event emitter.** Rejected: it moves memoisation into every consumer and
gives React nothing stable to compare, which is the tearing case
`useSyncExternalStore` exists to prevent.

**A fresh object per call.** Rejected: simplest to write, and precisely what
`useSyncExternalStore` forbids.

**Signals or observables inside the core.** Rejected: it would put a reactivity
library inside a package that must stay framework-free and run on the server
([0004](0004-headless-core.md), [0006](0006-one-engine-build.md)).
