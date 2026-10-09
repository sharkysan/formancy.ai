# 0155 — The object store is timed on its silence, not on the whole request

- **Status:** accepted
- **Date:** 2026-10-09
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/server/src/s3-file-store.test.ts`, the cases under *how long
  the store is waited on*, each against a stub store of its own. *A download still arriving
  after the timeout* and *a reader slower than the timeout* fail if the bound covers the
  whole request again — both failed against `0.4.0`'s `AbortSignal.timeout` with `The
  operation was aborted due to timeout`. *A store that never answers* hangs to its case limit
  without the clock before the headers, and *a store that stops sending halfway through a
  body* without the clock on the body — and fails if a stalled body ends instead of erroring.
  *The connection under a body nobody reads*, a few bytes of it and more than every buffer,
  fails if the clock starts at the first read rather than at the headers. *No clock left
  behind that keeps the process alive* fails if the clock's timer is referenced. *An upload
  slower than the timeout* asserts the gap this leaves, so closing it is deliberate.
  **Nothing fails for the cost this accepts** — a downloader who stops reading is held by
  nothing in the server — and arc42 §11.2 carries it as debt instead.

## Context

The S3 store ([0064](0064-an-object-store-behind-the-same-interface.md)) passed
`AbortSignal.timeout(timeoutMs)` to every `fetch`, thirty seconds by default, and `main.ts`
sets no other value, so no deployment could change it. That signal covers the whole
exchange, body included: a download still streaming when it ran out was cut off part-way,
however steadily its bytes were arriving. It was so in every release with the store,
`0.2.0` to `0.4.0`.

How long a download streams is mostly not the store's doing. The route hands the store's
stream to the reply, and backpressure carries the downloader's pace back through it to the
store's socket, so thirty seconds on the whole request was thirty seconds of the
downloader's bandwidth: a large attachment fetched over a slow link failed part-way.

The old bound did two things worth keeping. A store that stops answering was abandoned,
so it did not become a server that stops answering. And the connection under an error
document nobody reads was let go after the timeout, rather than whenever something else
closed it.

## Decision

**The timeout bounds how long the store keeps the server waiting, not how long a request
takes.** One clock per request runs from sending it until the headers arrive, starts again
at once because the store now owes the body, stops when a chunk arrives, and starts again
only when the caller asks for the next one. A chunk in the caller's hands costs the store
nothing. The `Response` is not handed out — only its status, headers and a body read
under the clock — so nothing can read a body around it. An upload stays bounded as a
whole: the store answers a PUT only once it has every byte.

## Consequences

**A download takes as long as the downloader needs**, and a store that is silent for the
timeout, before its answer or in the middle of a body, is still abandoned. The error says
which wait ran out — `no answer within …` or `no data within …` — where it said `The
operation was aborted due to timeout`.

**Nothing bounds a downloader who stops reading, and that is the cost.** The old bound ended
one within thirty seconds as a side effect; now the clock is stopped for exactly as long as
a chunk waits on its reader, so a client that opens a download and stops reading holds a
socket on the server, the stream behind it and a connection to the store for as long as it
likes. `app.ts` sets no `connectionTimeout`, and Fastify's default is none. The route
answers `401` to anybody not signed in, so it is somebody the deployment let in. The local
store has always behaved this way, with an open file in place of the connection, so this
makes the two stores alike rather than introducing the shape — but for an S3 deployment it
is a bound that was there and is not.

**An upload is still bounded as a whole.** A PUT that takes longer than thirty seconds,
body included, is abandoned however steadily it is going. The body goes as one buffer in
one request, with no chunks to restart a clock on. How large a file that is depends on the
link between the server and the store and has not been measured.

**Code where there was one argument**: a clock, a generator that stops and starts it
around each chunk, and a narrowed `Answer` type in place of the `Response`, all of it this
adapter's to keep right. The timer is unref'd, as `AbortSignal.timeout`'s was, so a clock
left running under an unread body does not hold a process up after everything else has
finished.

## Alternatives considered

**A longer timeout, or a setting for it.** Still a cap on the downloader's bandwidth, only
further away, and a dead store is held for as long. A deployer cannot choose the number
either: what it has to cover is the slowest link anybody downloads over, which is a
property of the downloaders and not of the deployment.

**Bound only the wait for the headers.** Clear the timer once the answer arrives and let
the body take what it takes. A store that answers and then stops sending would hold the
download and its connection open for ever, and the halfway case hangs to its limit with
the body's clock removed.

**undici's `headersTimeout` and `bodyTimeout`, through an `Agent`.** No new dependency:
undici is already one of the server's, for webhook delivery. Run once against the same
shapes on 2026-10-09 — undici 8.10.2, Node 22.22.1, a scratch script not kept — it let the
trickled body and the slow reader through and abandoned the silent and the stalled store,
as the clock does. It lost on what decides it. The property this record exists for, that a
reader holding a chunk stops the clock, comes from an `if (!paused)` in undici's
`lib/dispatcher/client-h1.js` that its documentation does not state: `bodyTimeout` is
described as the time between body data. And the same branch keeps it from firing under a
body nobody reads once undici's buffer is full: a `500` with 4 MiB of an 8 MiB body sent and
then nothing was still open after eight timeouts, where the clock here, restarted at the
headers, lets it go.

**Bound the downloader on the server's socket, in the same change.** It would close the gap
this opens, for both stores at once, and it lost on scope rather than merit. It is a bound
on every client of every route, which wants its own value and its own test in the server's
integration suite. Folded into a fix to the store it would be a side effect again — which is
how the store's timeout came to be the only thing ending a stalled download in the first
place.
