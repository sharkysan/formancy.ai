# 0031 — Make a failed login indistinguishable from an unknown user

- **Status:** accepted
- **Date:** 2026-09-20
- **Deciders:** Daniel Bacher
- **Verified by:** Partly. `packages/server-core/src/auth.test.ts`
  ("authenticates with the right password, refuses the wrong one, same-shaped
  answers") and `packages/server/src/server.integration.test.ts` ("a wrong
  password and an unknown user are indistinguishable 401s") assert the two
  answers are identical in shape and body. The equal-*work* property is not
  mechanically enforced: an early return for an unknown user would still
  produce the same body and still pass both tests. That half is held by the
  decoy hash being written down in `authenticateLocal` and by review.

## Context

The obvious implementation of a login looks up the user, returns early when
there is no such user, and verifies the hash otherwise. The early return is
several orders of magnitude faster than an argon2 verification, so the response
time answers a question the endpoint was never meant to answer: whether an
email address has an account here. For a self-hosted product the account list
is often the staff list.

## Decision

`authenticateLocal` hashes a throwaway string when the user does not exist and
verifies the presented password against that decoy hash, so both paths do the
same work and take the same time. The returned outcome is identical in both
cases, and the route turns it into one 401 body.

The surrounding choices follow from the same reading. Passwords are hashed with
argon2id via `@node-rs/argon2`. Sessions are short-lived JWTs signed HS256 with
`jose`. API keys are stored as a visible prefix plus a hash of the whole
secret, so a leaked database yields no usable key while the prefix still lets a
key be named in a log or a UI.

## Consequences

**What it buys.** The login endpoint tells an attacker nothing it was not asked.
The API key table is the same bet: it survives being read.

**What it costs.** A login attempt for an address that does not exist now costs
a full argon2 verification. That is deliberate and it is measurable, and it
turns the login route into the cheapest denial-of-service target on the server.
Rate limiting therefore matters more than it otherwise would — and there is
none yet. `@fastify/rate-limit` is a dependency of `@formancy/server` and is
not registered; the package README says so under Status.

**What it forecloses.** A "no such account, did you mean to sign up?" message,
and any password reset flow that confirms whether an address is known. Both
would reopen the oracle by another door.

## Alternatives considered

**Return early for an unknown user.** Rejected: the timing difference is the
whole vulnerability.

**A fixed artificial delay.** Rejected: it has to be longer than the slowest
real verification to hide anything, so it is both slower and still leaky under
statistical analysis. Doing the real work is simpler and honest.
