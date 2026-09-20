# 6. Runtime view

Four scenarios. The first two are the ones the whole design is arranged around.

## 6.1 A keystroke

```
person types
   │
   ▼
renderer  ──▶ engine.setValue(path, value)
                  │
                  ├─ store writes the value
                  ├─ dependents marked dirty on a bitset over node indices
                  └─ mutation joins the current microtask transaction
                              │
                        microtask boundary
                              │
                  ┌───────────┴────────────┐
                  │ evaluate dirty nodes    │  push-dirty / pull-compute:
                  │ in topological order    │  nothing recomputes until read
                  └───────────┬────────────┘
                              │
                  invalidate the snapshot of every field
                  whose observable state actually changed
                              │
                  one notification, carrying that set
                              │
                  ┌───────────┴────────────┐
                  ▼                         ▼
        React: useSyncExternalStore   Angular: signals, OnPush
        re-renders only fields whose  marks only those components
        snapshot identity changed     dirty
```

Two properties do the work. Mutations within a microtask are **coalesced**, so
a transaction touching twenty fields notifies once. And a snapshot's identity
changes only when that field's state changes
([0020](../decisions/0020-identity-stable-snapshots.md)), which is what lets
both frameworks avoid re-rendering the rest of the form — and lets React work
with no memoisation on the consumer's side.

Measured at ≈0.38 ms against a 1 ms budget on a large form.

## 6.2 A submission, and the server's replay

```
browser                              server
───────                              ──────
engine validates (UX only)
        │
        ▼
POST /f/contact-us
  X-Formancy-Schema-Hash: abc…  ───▶  resolve the version by hash policy
  { answers }                          │
                                       ├─ current?      → proceed
                                       ├─ older, diff compatible? → proceed
                                       └─ otherwise → 409 FORM_VERSION_CHANGED
                                                       with the new schema
                                       │
                                       ▼
                                  rebuild the engine from THAT version
                                  (compiled program cached by schema hash)
                                       │
                                  pin the clock for this submission
                                       │
                                       ▼
                                  replay in server mode:
                                   · recompute every computedValue,
                                     OVERWRITING what arrived
                                   · recompute visibility and requiredness
                                   · strip values under server-hidden subtrees
                                   · run every validator (see note below)
                                       │
                                  ┌────┴────┐
                                  ▼         ▼
                              invalid     valid
                                  │         │
                          errors in the     ├─ store canonicalData, not the body
                          identical shape   ├─ store form_version_id AND schema_hash
                          the client uses   ├─ write the audit row
                                            └─ enqueue the webhook job
                                                 …all in ONE transaction
```

The replay is a **check** rather than a second opinion only because the engine
is the same build ([0006](../decisions/0006-one-engine-build.md)) and the clock
is injected ([0019](../decisions/0019-injected-capabilities.md)). Without
either, the two evaluations could legitimately differ and the comparison would
mean nothing.

> **`runsOn` decides which validators run here.** `runsOn: 'both' | 'client' |
> 'server'`, defaulting to `both`, is what lets a uniqueness check be
> server-only and a debounced hint client-only. The replay filters out anything
> marked `client`, and the browser filters out anything marked `server` — the
> same rule, read from the same document, applied from the two ends
> ([0043](../decisions/0043-runs-on.md)).

The single transaction is the reason for choosing PostgreSQL
([0024](../decisions/0024-postgres-over-mongodb.md)): "the webhook fired but the
submission rolled back" is the worst support burden a self-hosted product can
have.

## 6.3 Delivering a webhook

```
every 5s, one pass at a time, in the server process
   │
   ▼
claimDueDeliveries(now, 20)      state = 'pending' AND next_attempt_at <= now
   │                             NO row lock — see the replica note below
   ▼
for each: the webhook still exists?
   ├─ no ──▶ state = 'dead'      nothing left to deliver to; retrying forever
   │                             against a deleted destination helps nobody
   ▼ yes
resolve the hostname OURSELVES
   │
   ├─ any address private? ──▶ refuse, without opening a socket
   │                           (unless FORMANCY_WEBHOOK_ALLOW_PRIVATE)
   ▼
POST through an undici agent whose lookup returns ONLY the checked address
   │     · Host header and SNI keep the original name, so TLS still validates
   │     · redirect: 'manual' — a redirect is a destination nothing checked
   │     · Stripe-scheme signature over `timestamp.body`
   │     · X-Formancy-Event-Id stable across attempts; attempt number sent,
   │       deliberately NOT signed, so a retry reuses the signature
   │     · response read to 64 kB and never interpreted
   ▼
afterAttempt(delivery, outcome, now, random)      pure; the only decision-maker
   │
   ├─ ok ──────────────▶ state = 'delivered'
   ├─ attempt < 8 ─────▶ state = 'pending', next_attempt_at = now + backoff
   │                     exponential with FULL jitter, so an outage's backlog
   │                     does not retry in one thundering instant
   └─ attempt == 8 ────▶ state = 'dead', lastError kept
```

A thrown send is caught and turned into a failed outcome rather than allowed to
escape, because escaping abandons every remaining delivery in the batch.

The pass is deliberately one batch that returns, not a loop that never does:
what to do is `@formancy/server-core` and testable without a clock or a
network, and when to do it is the host's
([0049](../decisions/0049-one-polling-worker.md)). The same decision records why
this is **not** a distributed queue — `claimDueDeliveries` takes no lock, so a
second replica delivers everything a second time.

## 6.4 Publishing a form

```
author saves
   │
   ▼
validateSchema           structural (ajv) then semantic:
   │                     duplicate keys · rename legality · nested repeaters
   │                     pages below top level · uncompilable patterns
   │                     logic targets · unresolvable message references
   ├─ invalid ──▶ errors written for a form author, not a compiler
   ▼
compile every expression, build the dependency graph
   ├─ cycle ──▶ refused, with the trace   ([0018](../decisions/0018-static-dependencies.md))
   ▼
canonicalise and hash                      ([0010](../decisions/0010-canonical-hash.md))
   │
   ▼
diffSchemas(current, new) ──▶ compatible | lossy | breaking, shown to the author
   │
   ▼
INSERT a new form_versions row          ← never an UPDATE; a trigger enforces it
UPDATE forms.current_version_id          ([0025](../decisions/0025-immutability-in-the-database.md))
CREATE per-form partial indexes for fields marked indexed
```

A form that could loop is never persisted. A published version is never
modified.

## 6.5 Resuming a draft after the form changed

```
resume(draftId)
   │
   ▼
diffSchemas(draftVersion, currentVersion)
   │
   ├─ compatible ──▶ rebind silently to the current version
   │
   ├─ lossy      ──▶ rebind, produce a migrationReport, and move data belonging
   │                 to removed fields into data.__orphaned — NEVER deleted
   │
   └─ breaking   ──▶ leave the draft read-only against its original version,
                     and offer an explicit "start over"
```

Migration is lazy, one draft at a time, on resume
([0027](../decisions/0027-lazy-draft-migration.md)). A batch migration over
everyone's saved answers at publish time would be the same operation performed
at the worst possible moment and without the option to decline.

**Submissions never migrate.** Only drafts do. That distinction is what makes a
two-year-old submission readable against the schema that produced it.
