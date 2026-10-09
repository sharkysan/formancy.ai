# 6. Runtime view

The flows worth drawing. The first two are the ones the whole design is arranged around.

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
re-check every expression with leaves typed as the MODEL says
   │                     the engine types them `dyn`, so an unfinished answer
   │                     is not an error — which also lets `seats * 4` compile
   │                     and then fail for every value, silently, forever
   ├─ no overload ──▶ refused, naming the fix
   │                     ([0054](../decisions/0054-expressions-that-never-work.md))
   ▼
canonicalise and hash                      ([0010](../decisions/0010-canonical-hash.md))
   │
   ├─ hash == the current version's ──▶ that version, unchanged. Not a new row:
   │                     republishing what is already published is a no-op, and
   │                     `UNIQUE (form_id, schema_hash)` is what makes it one
   │
   ├─ hash == an OLDER version's ──▶ already_published, with that version's number
   │                     a published version is immutable and cannot be
   │                     published twice; without this the insert raised 500
   ▼
the request declared the version it opened?  ← optional: a script composes a
   │                     document rather than opening one, and declares nothing
   ├─ declared, and something else is current ──▶ version_changed, carrying that
   │                     schema, so the editor shows the difference
   │                     ([0092](../decisions/0092-publishing-declares-what-it-opened.md))
   ▼
diffSchemas(current, new) ──▶ compatible | lossy | breaking, shown to the author
   │
   ▼
INSERT a new form_versions row          ← never an UPDATE; a trigger enforces it
UPDATE forms.current_version_id          ([0025](../decisions/0025-immutability-in-the-database.md))
CREATE per-form partial indexes for fields marked indexed
```

A form that could loop is never persisted. A published version is never
modified. **The two hash branches come before the declaration check**, and that
order is the point: an editor whose document already matches what is published
has nothing to merge — somebody else wrote exactly what they were going to
write — and a repeated deploy of an unchanged schema must not manufacture a
version. And the second expression check runs *here* rather than in the
engine: a form already published with that mistake keeps opening for whoever is
halfway through filling it in, with the one field that never fills in that it
has always had.

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

## 6.6 Uploading a file

```
browser                              server
───────                              ──────
POST /f/claim/files
  { field, name, size,       ───▶  maySubmit — the submission's gate, the same function
    contentType }                   the field's accept and maxFileSize, the operator's ceiling
                                       ├─ refused ──▶ 403 · 413 · 400, before a byte is sent
                                       ▼
                                  INSERT the row: offered, key minted from form and id
                      ◀───  201 { id, storageKey, uploadUrl }

PUT uploadUrl  (bytes)       ───▶  this form's file, and still offered?   404 · 409 already_uploaded
                                  the size the offer named?               400 size_mismatch
                                       │
                                  leaseFile   UPDATE SET receiving_until = now + 2 min
                                              WHERE offered AND (no lease OR it has run out)
                                       ├─ no row ──▶ 409 busy, before the bytes are scanned
                                       ▼
                                  the deployment's scanner, if it has one
                                       ├─ finding ─────────▶ release · 422 refused_by_scanner
                                       ├─ cannot be asked ─▶ release · 503 scanner_unavailable
                                       ▼
                                  the row still names this lease, and it has not run out?
                                       ├─ no ──▶ release · 409 busy
                                       ▼
                                  put the bytes under the minted key
                                       │
                                  settleFile  UPDATE SET stored, receiving_until = NULL
                                              WHERE offered AND receiving_until = this lease
                                       ├─ no row ──▶ 409 busy: the write outlasted it
                                       ▼
                      ◀───  204

POST /f/claim/submissions    ───▶  the replay in 6.2, then in its ONE transaction:
  { evidence: [{ id, … }] }         UPDATE SET claimed, submission_id
                                    WHERE id IN (…) AND stored
                                       └─ fewer rows than named ──▶ the whole submission rolls back

every 15 minutes, in the server process:
  offered or stored, created more than a day ago ──▶ the bytes removed, then the row
```

The order is the design, in four places. **The row before the bytes**, so an upload that dies
halfway leaves something the collector knows to look for; **the claim inside the submission's
transaction**, so a submission exists if and only if its files belong to it
([0055](../decisions/0055-files-are-claimed.md)). **The scan before the bytes are kept**, so a
file the scanner refuses is never in the store
([0131](../decisions/0131-an-upload-is-scanned-before-it-is-kept.md)). And **one request between
the lease and the settle**, because the scan is where the time goes: a request that wrote back
the row it read before scanning could, after a faster one's file had been claimed, put the row
back to `stored` with no submission — for the collector, a day later
([0153](../decisions/0153-a-file-is-received-by-one-request-at-a-time.md)).

Every guarded write is one conditional `UPDATE` whose row count is the answer, so two requests
racing each other are decided by the database rather than by whichever check ran first. Every
way out of the `PUT` that keeps nothing releases the lease before it replies, so a `PUT` of the
same file sent again, as the reply invites, is not refused as busy; a release that fails leaves
the reply as it was, and the lease runs out on its own. A write that outlasts its lease is the
one thing the lease does not stop: its settle is refused, but its bytes land under the same key
([§11.2](11-risks-and-debt.md)).

## 6.7 Writing a form from a sentence

```
pane                         authorForm, in builder-core                      host's AskModel
────                         ───────────────────────────                      ───────────────
Write it
  stop = createStop()
  busy, Stop shown    ───▶   for attempt 1 … limit
                               stopped already? ──▶ ended: stopped
                               ask({ system, user, attempt, limit,
                                     followUp from attempt 2 }, turn)  ───▶  its request
                                 ├─ Stop pressed, or the pane goes away
                                 │     ──▶ turn.onCancel ──────────────────▶  abort, if it listens
                                 │     ──▶ ended: stopped; a later answer settles nothing
                                 ├─ rejected or threw ──▶ ended: unreachable, with its reason if any
                                 ▼
                               readAnswer
                                 ├─ {"declined": why} ──▶ ended: declined, with the reason
                                 ▼
                               validateSchema → the engine's compile → expressionProblems
                                 ├─ refused ──▶ the complaint goes into the next turn
                                 ▼
                               ok: the document
                             every attempt refused ──▶ ended: gave-up
                      ◀───   resolves, however it ended

  proposalStatus(result)           ──▶ the live region: one sentence for each ending
  proposeEdit(current, document)   ──▶ the review ──▶ applyProposal (0109)
```

**The stop is the person's, and it does not wait for the host.** Each turn is raced against
it, so the run ends the moment Stop is pressed, or the pane is unmounted or destroyed. The
host is told through `turn.onCancel` and may abort its request. A host that ignores it is
stopped all the same, and its answer, when it comes, resolves a promise nothing is waiting
on. **A host's error is an ending, not an exception.** `authorForm` resolves with
`ended: 'unreachable'` and the error's message, so the sentence the pane says is decided once,
in `proposalStatus`, and not by two panes each catching the rejection
([0157](../decisions/0157-a-models-turn-can-be-stopped.md)). Only the latest complaint goes
back to the model, in `user` for a host that keeps no conversation and alone as `followUp`
for one that does ([0056](../decisions/0056-agents-get-the-checks.md)).

**A decline is an ending too.** The briefing offers the model `{"declined": "<why>"}` for a
request the format cannot express, and an answer of exactly that shape ends the run on the
turn it came, before any check. Another turn would be paid for to hear the same answer, or
to talk the model out of it. The pane says the model declined and shows its reason, as text, in place of
the problem list ([0158](../decisions/0158-a-model-may-decline.md)).
