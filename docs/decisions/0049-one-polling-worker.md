# 0049 — Drain the outbox from one polling worker, and say so

- **Status:** accepted
- **Date:** 2026-09-20
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/server-core/src/outbox.test.ts` (nine cases: the
  retry decision in isolation, a thrown send that must not abandon the batch, a
  delivery whose webhook has been deleted, and a future delivery left alone),
  `packages/server/src/deliver.test.ts` (twelve, including the escape hatch
  getting past the address check and nothing else), and a manual end-to-end run
  against a signature-verifying receiver — submission to verified delivery on
  attempt 1.

## Context

[0048](0048-webhook-delivery.md) left the outbox queued and undrained: the
decisions about *whether* and *when* to retry were implemented and tested, but
nothing turned the crank. Three questions had to be answered before anything
could.

**What runs it.** A queue library (pg-boss was the plan) brings a schema, a
migration story and a supervisor process into a product whose selling point is
`docker compose up`.

**What happens with more than one replica.** Whatever runs it, two copies of it
deliver everything twice.

**What happens to a receiver on a private address.** The SSRF guard in 0048 is
unconditional, which means the sidecar deployment the design itself names — a
receiver on the same host — cannot be delivered to at all.

## Decision

**A `setInterval` in the server process, five seconds, one pass at a time.** No
queue library. `drainOutbox` is a single batch that returns how many rows it
attempted, so the thing that decides *when* belongs to the host and the thing
that decides *what* stays pure and testable without a clock. A pass that is
still running suppresses the next tick, because overlapping passes let one slow
receiver cause this very process to send the same delivery twice.

The timer is `unref`'d: an empty poll must not be the reason a process cannot
exit.

**One worker, stated rather than discovered.** `claimDueDeliveries` does not
lock rows, so two replicas both pick up the same delivery. This is written in
the module's own header, in the deployment docs and here, because the failure
is invisible until a receiver complains about duplicates. The stable event id
from 0048 is what makes it survivable; it is not what makes it correct. A
`FOR UPDATE SKIP LOCKED` claim is the fix, and it is a contained change to one
port method when someone needs it.

**`FORMANCY_WEBHOOK_ALLOW_PRIVATE` is per-deployment, never per-form.** The
guard exists because a *form author* must not be able to point the server at
the metadata service. An operator who runs the receiver themselves is not that
threat. So the escape hatch lives in the environment, alongside
`FORMANCY_WEBHOOK_ALLOW_HTTP`, and both default to off. Putting it in the
schema would hand the attacker the switch.

**A thrown send is a failed attempt, not a lost job.** `drainOutbox` catches
around each send and converts it into an outcome, because letting one escape
abandons every remaining delivery in the batch. A delivery whose webhook has
since been deleted is marked dead rather than retried against a destination
that no longer exists.

## Consequences

**What it buys.** Webhooks actually arrive, with no new infrastructure and no
new container. The whole retry policy stays unit-tested without a network, and
the worker is short enough to read in one screen.

**What it costs.** Up to five seconds of latency before a delivery is
attempted, which for a webhook is nothing. Polling an empty table forever,
which is one indexed query every five seconds. And the replica constraint
above, which is a real limit on horizontal scaling of the *server* process,
not only of the worker.

**What is still absent.** A per-action circuit breaker, so a receiver that has
been down for a day is retried on the same schedule as one that failed once,
and dead-letter replay from the admin — the rows are there and findable, but
re-queueing one is a SQL statement today.

## Alternatives considered

**pg-boss**, as originally planned. Rejected for v1: it is the right answer at
the point where there are several workers and several job types, and today
there is one of each. Its schema and supervisor are a permanent cost paid for a
feature — reliable scheduling across processes — that a single-replica
deployment does not use. The port boundary means adopting it later replaces one
file.

**`LISTEN`/`NOTIFY` instead of polling.** Rejected: it removes the five-second
latency and adds a connection that must be held, re-established and reconciled
with rows queued while it was down — at which point you need the poll anyway,
as a floor.

**A separate worker container.** Rejected: it doubles what `docker compose up`
starts and what a self-hoster has to understand, to solve a problem
(the web process being busy) that a five-second poll does not have.

**Allowing a private address per webhook.** Rejected — see above. The form
document is exactly the surface the guard is defending against.
