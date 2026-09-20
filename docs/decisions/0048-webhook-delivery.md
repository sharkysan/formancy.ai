# 0048 — Deliver webhooks from a transactional outbox, to an address we checked

- **Status:** accepted
- **Date:** 2026-09-20
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/server-core/src/address.test.ts` (17 cases,
  including ranges adjacent to the private ones, IPv4-mapped IPv6 and
  unparseable input), `packages/server/src/deliver.test.ts` (10 cases, all the
  rebinding shapes, with an injected resolver so no network is needed),
  `packages/server-core/src/webhook.test.ts` (13, including an HMAC pinned
  against a value computed independently with Node's crypto), and `the webhook
  outbox` in `packages/server/src/server.integration.test.ts` against real
  PostgreSQL.

## Context

Three problems, and only the first is obvious.

**Delivery must not be lost or invented.** Posting after the submission insert
returns produces the two failures a self-hoster cannot debug: the webhook fired
and the submission rolled back, or the submission is stored and nothing was
ever sent.

**The server is a confused deputy.** It sits inside somebody's private network,
and webhook URLs are written by whoever can edit a form. It can reach the
database, the metadata service and every internal admin panel, and it will
fetch what it is told to.

**A receiver has to be able to trust and dedupe what arrives**, or every
integration reimplements both badly.

## Decision

**The outbox commits with the submission.** `insertSubmission` takes the
deliveries it triggers and writes both in one transaction — one port method
rather than two calls, because a port that exposes them separately invites a
caller to break the atomicity. This is the requirement that chose Postgres
([0024](0024-postgres-over-mongodb.md)), and the integration test is where the
claim is actually checked.

**The address that was checked is the address connected to.** "Validate the URL
then fetch it" is defeated by DNS rebinding: the two lookups are independent
and an attacker only has to win the second. So delivery resolves the name
itself, refuses if **any** returned address is private, pins the first, and
connects through an undici agent whose `lookup` returns only that address —
while the original hostname stays in the Host header and SNI so TLS still
validates. Redirects are not followed, because a redirect is a second
destination nothing checked. The response is read to a 64 kB cap and never
interpreted.

**Signing is Stripe's scheme**, deliberately: receivers already have code for
it, and a scheme somebody must implement from scratch is one most will skip.
The signed payload is `timestamp.body`, so a captured signature cannot be
replayed forever and the timestamp cannot be edited. The event id is stable
across retries — a fresh one per attempt would turn our retry into their
duplicate — and the attempt number is sent but deliberately not signed, so a
retry reuses the signature.

Retries are exponential with **full jitter**. The jitter is not decoration:
without it every delivery queued during one outage retries at the same instant
and the receiver coming back up is knocked over by the herd.

## Consequences

**What it buys.** A delivery is queued if and only if the submission exists. A
receiver can verify and dedupe with code it already has. And the URL an author
types cannot be used to read the cloud metadata service.

**What it costs.** Pinning the address means a host behind round-robin DNS is
contacted at one address per attempt rather than balanced across them, and a
deployment whose receiver legitimately lives on a private address must set
`allowHttp` and accept that the guard is off for it. Refusing every address
when any is private is stricter than necessary for a multi-homed host that is
genuinely public on one interface; the stricter rule is the one that cannot be
walked around.

**What is not built.** The worker that drains the outbox — the ports exist
(`claimDueDeliveries`, `updateDelivery`) and the schedule is implemented and
tested, but nothing runs it on a timer yet, so queued deliveries sit in the
table. A per-action circuit breaker and a dead-letter replay in the admin are
also absent.

## Alternatives considered

**Post inline, after the insert.** Rejected: it is the failure in the Context,
and it also makes submission latency depend on a third party.

**Validate the URL and use `fetch`.** Rejected — it is the difference between a
mitigation and theatre, and it looks identical from the outside, which is what
makes it worth writing down.

**A denylist of hostnames rather than addresses.** Rejected: `localhost` has a
thousand spellings and none of them is the problem. The address is the thing
that matters.

**Our own signature scheme.** Rejected. A better scheme that receivers do not
implement is worse than a familiar one they do.
