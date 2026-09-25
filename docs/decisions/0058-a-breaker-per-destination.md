# 0058 — A breaker per destination, and a way to replay what died

- **Status:** accepted
- **Date:** 2026-09-25
- **Deciders:** Daniel Bacher
- **Verified by:** `apps/admin/src/webhooks-pane.test.tsx` (8 cases, including
  that a failing destination is named in words rather than by colour alone and
  that a refused replay is shown rather than swallowed),
  `packages/server-core/src/breaker.test.ts` (13 cases: when it
  opens, that a success clears it completely, that the cool-down earns one probe
  rather than a return to normal, and that the health shown to a person never
  carries the signing secret), the `a destination that has stopped listening`
  and `replaying a dead delivery` blocks in
  `packages/server-core/src/outbox.test.ts`, and the `webhook health` and
  `dead letters` blocks in `packages/server/src/server.integration.test.ts`
  against real PostgreSQL.

## Context

The retry schedule gives up after eight attempts — **per delivery**. That is
the wrong unit when the destination is down.

A form taking a submission a minute produces a minute's worth of deliveries,
each independently trying eight times against an endpoint that has been
returning 502 since Tuesday. The receiver is hammered by a service that has
been told to stop, the worker spends its batch on work that cannot succeed, and
the deliveries that might have worked queue behind it.

Dead-lettering made one part of this worse: a delivery that ran out of attempts
was kept, deliberately, as evidence that something was supposed to be sent and
never arrived — and there was no way to list that evidence or act on it.
Evidence in a table nobody can read is the same as no evidence.

## Decision

**Failure is counted per webhook as well as per delivery.** Three consecutive
failures open the breaker. Not one: a single failure is a deploy, a timeout, a
receiver restarting, and opening on it would make every routine blip a visible
outage. Three in a row is a destination that is not coming back on its own.

**The cool-down earns one attempt, not a return to normal.** After five minutes
the breaker is half-open and exactly one delivery goes through as a probe. It
succeeds and the breaker closes; it fails and the cool-down starts again.
Closing on the clock alone would send the whole backlog at a destination that
has not answered yet.

**A success clears the count completely** rather than decaying it. Decaying
would leave a destination that fails twice for every success permanently one
blip away from opening, and that destination is working.

**Being skipped is not a failed attempt.** A delivery held back by an open
breaker keeps its attempt count and has its next attempt pushed out. Charging
it one would spend a delivery's eight tries on a destination it never reached.

**The counters live on the webhook row, not in the worker.** Memory does not
survive a restart and cannot be shown on a screen, and being shown on a screen
is the point — the admin has a **Webhooks** tab that lists which destinations
are failing, since when, and what died on the way to them, with a button to
send a dead delivery again: a self-hoster has no operations team watching a dashboard, so a
destination refusing deliveries since Tuesday has to be answerable from the
product. Otherwise it is discovered when somebody asks why the CRM has no leads
this week.

**Dead deliveries can be listed and replayed.** `GET /deliveries/dead` says
what failed and why; `POST /deliveries/:id/replay` puts one back with its
attempt count reset, because it is a new run against a destination somebody has
looked at and decided is fixed. Carrying the old count over would give it one
try before dying again, which is a formality rather than a replay.

## Consequences

**What it costs.** A destination that recovers inside the cool-down waits up to
five minutes longer than it needed to. That is the trade for not hammering it,
and five minutes is short enough that nobody notices once it works.

**Replay is refused for anything not dead**, and the reason is worth stating: a
pending delivery is already queued and replaying it would duplicate it, and a
delivered one would be sent twice. The event id is stable across retries so a
well-behaved receiver would ignore the second — and this service does not get
to assume the receiver is well-behaved.

**Neither listing leaks.** The dead-letter listing has no body: that is the
submission's data in another coat, and the endpoint answers "what failed", not
"what was in it". The health listing has no signing secret: it is shown on a
screen, and a secret is not a health indicator.

**A replay is audited.** It sends data to a third party on a person's say-so,
which is exactly the shape of thing
[0057](0057-the-audit-log-records-reads.md) exists to record.

## Alternatives considered

**Rely on the per-delivery retry schedule alone.** Rejected: it is what the
system did, and it is the behaviour described above.

**Open on the first failure.** Rejected: a deploy would look like an outage,
and the cool-down would then delay every recovery by five minutes.

**Delete dead deliveries.** Rejected: the row is the evidence that something
was supposed to be sent and never arrived, which is the one thing a self-hoster
cannot reconstruct.

**A per-form breaker rather than per-webhook.** Rejected: two webhooks on one
form are two destinations, and one being down says nothing about the other.
