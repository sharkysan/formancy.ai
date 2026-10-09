# 0153 — A file is received by one request at a time

- **Status:** accepted
- **Date:** 2026-10-09
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/server/src/server.integration.test.ts` on real PostgreSQL, under
  *an upload the deployment scans › one request at a time*. A scanner double holds one `PUT`
  open: a second is refused as `busy` before it is scanned, and the first is kept; without a
  scanner, a write held open is refused the same way, where `main` answered a second `204`.
  With the first's lease run out, a second `PUT` is stored and claimed by a submission, and
  when the first resumes the row is still `claimed` with that submission's id and the bytes are
  the second's — the case that failed on `main`, where the row went back to `stored` with no
  submission and the store held the first request's bytes. Eight pairs of leases taken at once
  give one winner each, which a lease that reads and then writes does not. A stale settle, a
  settle of a claimed row — even one naming that very lease — and a stale release change
  nothing. A write that throws gives the file back, so a `PUT` of that file sent again is
  stored rather than busy; and when giving it back fails as well, the reply is still the
  write's own error, or the scanner's refusal, rather than the release's. A database from
  before the column gains it on start, with no file held. A write that outlasts its lease
  leaves the row alone and its bytes replace the claimed ones: the residual, pinned so that
  closing it is deliberate. `packages/server-core/src/uploads.test.ts` holds the in-memory
  storage to the same conditions one at a time. Dropping any condition from either
  implementation, ignoring the lease's answer, skipping the read before the write, ignoring the
  settle's answer, keeping the lease after a throw, or adding the column only where the table is
  created fails a named case; not giving the lease back after a refusal fails the existing case
  that sends the same bytes again once the scanner is back. That the supplied clamd adapter
  does not bound a scan's length, which *Two minutes* below rests on, is held by
  `packages/server/src/clamd-scanner.test.ts`: an answer that keeps arriving is read past the
  adapter's timeout, and a deadline in its place fails that case.

## Context

The `PUT` that receives an offered file's bytes read the row, checked it was `offered`, asked
the deployment's scanner, wrote the bytes and then wrote the row back with
`updateFile({ ...file, state: 'stored' })` — setting `state` and `submission_id` to what the
request had read before its scan, unconditionally. Since
[0131](0131-an-upload-is-scanned-before-it-is-kept.md) the scan sits in the middle, and the
scan is where the time goes. Before it the window was the write alone, and the same
unconditional write is in every release that accepts uploads —
[`SOUP-DECLARATION.md`](../regulatory/SOUP-DECLARATION.md) lists them.

Two requests for one file both passed the `offered` check. If the faster stored the file and a
submission claimed it while the slower was still being scanned, the slower then wrote its bytes
over the claimed ones and put the row back to `stored` with no submission — and the collector
deletes an unclaimed file after a day ([0055](0055-files-are-claimed.md)). An accepted
submission's attachment changed, then disappeared, and nothing about the submission said so.

The clients this repository supplies never send two `PUT`s for one file. The file field's
**Try again** runs the host's uploader again (`packages/core/src/uploads.ts`), and the admin's —
the only uploader here that sends to the server — offers the file anew before every `PUT`
(`apps/admin/src/api.ts`), so a second attempt is a second file with its own id. Two requests
for one file come from elsewhere: a proxy or an HTTP library retrying a `PUT`, which HTTP
allows because it calls the method idempotent; an integrator's uploader that sends the bytes
again without offering again; or whoever holds the file's id, on purpose, since the `PUT` asks
for the form's path and the id and nothing else. Nothing here measures how often any of them
happens.

Found by reading `routes/files.ts` against `postgres-storage.ts`, and reproduced on `main` with
a scanner double holding the first request open: the row read `stored`, `submission_id` was
null, and the store held the first request's bytes.

## Decision

**One request at a time receives a file's bytes, for a bounded time.** A lease:
`receiving_until` on the file's row, taken by a conditional `UPDATE` only while the file is
`offered` and no lease that has not run out holds it. A request that cannot take it is answered
`409 busy` before its bytes are scanned. One that can scans, then reads the row again before
writing — the scan can outlast the lease — and settles with a conditional `UPDATE` that sets
`stored` and clears the lease only while the file is still `offered` and its own lease still
holds it. Every way out that keeps nothing — a finding, a scanner that cannot be asked, a throw
— gives the lease back, before the reply, so a client that sends the file again, as the reply
invites, is not refused as busy. A release that fails is not allowed to decide the reply: it
is most likely the database the request has already failed on, its error would stand in for the
one that says why the bytes were not kept, and the lease runs out on its own.

**`updateFile` is gone from the `Storage` port.** `leaseFile`, `settleFile` and `releaseFile`
replace it, each one conditional statement whose row count is the answer, the shape of
`spendChallenge`. A write that set the row from whatever the caller held was the defect, and a
port offering one invites the next caller to repeat it. The settle sets the state and clears the
lease, nothing else: a file's submission is `insertSubmission`'s alone.

**A lease is named by the instant it runs out.** The request keeps it and hands it back to
settle or release. Two requests cannot hold the same one: a lease is taken only once the last
has run out, so the next always ends later.

**Two minutes**, as a judgement rather than a bound the adapters guarantee. The object store
this package supplies abandons a `PUT` after 30 seconds, as a whole. Its clamd adapter's 30
seconds are an idle timeout — `socket.setTimeout`, restarted by any traffic on the connection —
so it abandons a clamd that has gone quiet and not a scan that is still moving: nothing supplied
bounds how long a scan takes. The directory store has no limit of its own. Two minutes is well
past either 30-second limit, and what a longer lease costs is how long a request that died
holding a file keeps a `PUT` of that same file busy. It is a constant in the route, not a
setting.

**No fourth state.** The `CHECK` on `state` stays `offered`, `stored`, `claimed`. A `receiving`
state would need something to move a file out of it when the request holding it dies — which is
a lease again, with a state beside it to keep in step.

## Consequences

**What it buys.** A request receiving bytes cannot write a claimed row: the settle does not
match it. A second request while one is receiving is told so before its bytes are scanned,
rather than told they were kept when they were about to be overwritten.

**What it costs.** A nullable column, added on start to a database that predates it
([`MIGRATIONS.md`](../../MIGRATIONS.md)). Two more round trips per upload — the lease and the
read before the write — and a third on a refusal. A breaking change for anybody embedding
`@formancy/server-core` over storage of their own: three methods to implement, `updateFile` to
remove, and `receivingUntil` on `FileRecord`. A request that died holding a file makes every
`PUT` of that same file `busy` for up to two minutes — not the file field's **Try again** through
an uploader that offers anew, as the admin's does. And the lease runs on the server's clock, so
replicas whose clocks disagree disagree by that much about when one has run out.

**What it does not close.** A lease bounds when a write may *start*, not how long it takes. A
request whose write outlasts its lease — a scan and a write together slower than two minutes —
writes its bytes under the key the request that took over also wrote. The supplied adapters do
not prevent it: a scan that ends just inside the lease, followed by an object-store write that
crosses it, is enough, and so are a deployment's own adapters or a stalled disk under the
directory store. Its settle is refused, so the row stays claimed by the right submission, but
the bytes in the store can be the late request's. Both were scanned, and both were the size
offered. Nothing records that it happened beyond the `409` the late request is answered with:
the server has no request log, by design (C3 in
[`SAFETY-ANALYSIS.md`](../regulatory/SAFETY-ANALYSIS.md)), and a line on standard error per
request would be one. [`11-risks-and-debt.md`](../architecture/11-risks-and-debt.md) carries
it, and the integration suite asserts it, so that closing it is a decision rather than an
accident.

## Alternatives considered

**Settle conditionally and nothing else.** `UPDATE … SET state = 'stored' WHERE state =
'offered'` stops the un-claiming, which is the half anybody notices. It leaves two requests
writing one key, the second over what the first's submission was accepted with, and tells both
their bytes were kept.

**A `receiving` state.** A fourth state, a changed `CHECK`, and still a timeout to recover a
file from a request that died holding it.

**A row lock held across the scan.** `SELECT … FOR UPDATE` in a transaction spanning the scan
and the write holds a database connection for as long as clamd takes, per upload, from a pool
of ten. A slow scanner would become an outage of every form.

**A lock in the process, or an advisory lock.** The first is wrong at the second replica, which
the object store exists to allow ([0064](0064-an-object-store-behind-the-same-interface.md)).
The second belongs to a database session, so it costs a held connection as the row lock does.

**A key per attempt, settled atomically.** It closes the residual: each request writes under
its own key, and the settle names the one kept. But the key is returned by the offer and stored
in the submission's answer, so the submission would name a key that is not where its bytes are
— a change to what a submission records, for a residual only a scan and a write together slower
than two minutes reach.
