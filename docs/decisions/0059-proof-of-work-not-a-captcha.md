# 0059 — Proof of work, not a captcha service

- **Status:** accepted
- **Date:** 2026-09-25
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/server-core/src/challenge.test.ts` (14 cases: the
  happy path once, and then every way past it — a forged challenge, a stale
  one, the wrong number, a solution signed with another key, and malformed
  rubbish), plus `the proof-of-work challenge` in
  `packages/server/src/server.integration.test.ts` against real PostgreSQL,
  where two requests race one solution and exactly one wins.

## Context

Anonymous submission is the highest-risk surface this product has. It is
currently defended by per-IP rate limits, a per-form origin allowlist and a
body cap — all of which an attacker with a few addresses walks past.

The obvious answer is Turnstile or reCAPTCHA.

## Decision

**Proof of work, computed in the visitor's browser, verified with the server's
own key. No third party.**

Turnstile and reCAPTCHA both round-trip every visitor through somebody else's
service before that visitor may speak to a form. For the European self-hosters
this product is aimed at, that turns a form on their own server into a data
transfer to a third party, on every visit, whether or not the visitor ever
submits. It is a consent conversation they did not ask for, about a service
they do not control, to solve a problem on their own machine.

It is also unpleasant at the edges: a Tor or VPN user is served a puzzle or a
refusal on the strength of their address, with no override available to the
person running the form.

**The scheme.** The server picks a secret number below a ceiling, publishes
`sha256(salt + number)` and the salt, and signs that hash with its own key. The
browser searches upwards from zero. Verification recomputes the hash and checks
the signature — so **a challenge nobody minted cannot be solved into a valid
one**, and no state is needed to establish that.

**Expiry rides in the salt**, so a stale challenge is refused without a lookup.

**Spending is separate, and storage-backed.** The signature proves we minted it
and the hash proves somebody did the work; neither stops the same correct
solution being replayed, because a correct solution stays correct. The
`spent_challenges` table has the challenge as its primary key, and the insert
IS the claim — two requests arriving with one solution both pass every
stateless check, and only the database can decide which of them spends it.

**A hundred thousand hashes**, about a tenth of a second, and unnoticeable
beside the time somebody spent filling the form in. Raising it punishes the
slowest device far more than the attacker, who has the fastest one.

**Only for visitors who are not signed in.** Somebody with a session has
already paid a cost this stands in for.

## Consequences

**What it buys, stated honestly.** Not "proof you are a person" — proof that
a few hundred milliseconds of a CPU were spent for this one submission. A
determined attacker pays it. A script pointed at a thousand forms does not,
because the cost is per submission and cannot be amortised, and that is the
traffic a public form actually gets. It is one layer of several, and treating
it as the defence would be the mistake.

**Unset is a supported state.** A deployment whose forms all require a session
has no anonymous surface to protect. The challenge route answers 404 rather
than failing, and the submission path does not ask.

**The scheme is its own package, and that is the point.** It is used in two
places that cannot share server code: the server mints and verifies, a browser
solves. A solver written separately would be a second description of one
protocol, and the day the two disagreed the symptom would be submissions the
server rejects for no visible reason — which reads as an attack rather than
as a bug. So `@formancy/challenge` is zero-dependency and isomorphic, built on
Web Crypto because that is in every browser and in Node, and
`@formancy/server-core` re-exports it rather than restating it.

Everything is asynchronous as a result. A synchronous hash would mean shipping
an implementation of SHA-256, and an implementation is a thing to keep correct
forever.

**Spent challenges are swept hourly** by `startChallengeSweeper`, on its own
timer rather than as a job on the file collector: the two are configured
independently, and a deployment with public forms and no uploads still
accumulates rows.

## Alternatives considered

**Cloudflare Turnstile.** Rejected on the reasoning above. It is the better
product in isolation and the wrong one for a self-hosted, GDPR-sensitive
deployment, and it cannot be the DEFAULT for a project whose pitch is that
nothing phones home.

**A honeypot field alone.** Rejected as insufficient, not as wrong — it costs
nothing and catches the laziest traffic, which is why it stays.

**A signed submission token minted on form load.** Rejected as weaker for the
same price: it proves the form was fetched, not that anything was spent, and a
script fetches the form.

**Storing a nonce per challenge at mint time.** Rejected: it would make minting
a write, and minting is public and unauthenticated. An attacker would fill the
table by asking for challenges they never solve.
