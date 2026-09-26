# 0062 — A draft carries its own key

- **Status:** accepted
- **Date:** 2026-09-26
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/server-core/src/use-cases.test.ts` (4 cases: starting
  a draft returns an id the caller did not choose and a token over it, saving
  without the token is refused before the write, resuming without it returns
  nothing, and one draft's token does not open another), and
  `packages/server/src/server.integration.test.ts` (4 cases at the HTTP layer,
  where the hole was actually reachable: both routes without a token, a wrong
  token answered as 404 rather than 403, and a crossed token). Removing either
  check fails them.

## Context

The public submission plane is anonymous by design. A visitor fills in a form
with no account, and autosave keeps a draft so that closing the tab does not lose
half an hour of typing.

The draft routes were:

```
PUT /f/:path/drafts/:draftId
GET /f/:path/drafts/:draftId
```

**Both unauthenticated, with the id supplied by the caller.** `saveDraft`
upserted whatever id it was given; `resumeDraft` looked one up and returned its
contents. There was no ownership check of any kind, no rate limit on either
route, no origin allowlist, and no challenge.

A draft holds whatever the form asks for. On the forms this product is built for
that is a name, an address, a complaint, a medical history — the same content a
submission holds, at the point where the person has not yet decided to send it.

So the reading half was an **unauthenticated disclosure of personal data to
anybody who knew or guessed an id**. Guessing was not hard: the id came from the
client, so a client that used a counter made every other draft on that
deployment readable.

The writing half is worse, and was the part that settled this. Anybody could
**overwrite** a stranger's draft. The person then resumes what they believe is
their own part-finished form, does not re-read the fields they already filled in,
and submits the substituted content **under their own name**. Nothing in the
submission, the audit log or the stored draft records that the content was not
theirs, because as far as the server is concerned nothing unusual happened.

This was found while starting the roadmap's next feature, which the roadmap
described as "the public-plane endpoint and the resume token" being missing. The
endpoints already existed. Only the token was missing, and without it the
endpoints should not have existed.

**The hazard analysis did not have it either.** `SAFETY-ANALYSIS.md` section C —
*data reaches the wrong party* — had four entries, and none of them was about
drafts. C2 covers a submission being read by somebody not entitled to it; a draft
is not a submission and took a different route with no check on it. That gap in
the document is recorded as part of this change, because a hazard analysis that
misses a live hole is a worse artefact than the code was.

## Decision

**The server picks the draft id and signs it, and the signature is the key.**

`POST /f/:path/drafts` starts a draft. It returns the id — which the caller no
longer chooses — and a token:

```
token = HMAC-SHA256(secret, `${formId}:${draftId}`)
```

Both other routes require it, in `X-Formancy-Draft-Token`. Saving verifies before
the write. Resuming verifies before the lookup.

**Stateless, the same shape the proof-of-work challenge uses**
([0059](0059-proof-of-work-not-a-captcha.md)): no second table, no row to keep,
and no lookup before the check. A draft that was never started has no valid token
either, so the two cases need no distinguishing.

**Bound to the form as well as the id**, so a token cannot be carried to a draft
of a different form that happens to share an id.

**Compared in constant time.** A comparison that returns on the first differing
byte leaks how much of a guess was right, and a token is guessed one byte at a
time by exactly that signal.

**A wrong token is answered exactly like a draft that is not there** — 404, not
403. Answering differently would confirm which ids exist, which is the
enumeration this decision closed. The one case that is told apart is *no token at
all*, which is 401: that request cannot be judged, let alone answered.

**The host's own signing key signs it.** A draft token is a server-signed bearer
token, which is what that key is already for. A separate optional secret was
rejected: an optional secret means drafts are unprotected on every deployment
where nobody set one, which is how this class of hole is usually reintroduced.

## Consequences

**Losing the token loses the draft**, and there is no recovery path. That is the
correct trade: the alternative is a recovery path that works for whoever asks,
which is the hole again. It also means the token is the one thing a client must
persist — in `localStorage`, or in a link the person keeps — and that is the
client's business rather than the server's.

**The draft id is no longer security-relevant.** It was the only thing standing
between a stranger and somebody's answers, and it was not built to carry that.
Now it is an identifier and the token is the secret, which is the separation that
should have been there from the start. A test asserts two starts differ rather
than asserting the id's length, because how unguessable the id is belongs to the
host's injected `newId` and is no longer load-bearing.

**This is a breaking change to a published API**, and deliberately not softened.
A compatibility window in which the old unauthenticated routes keep working is a
window in which the hole is still open, and anybody relying on the old shape is
relying on being able to read other people's drafts. `MIGRATIONS.md` says what to
change.

**What is still missing.** The token does not expire. The challenge's salt
carries an expiry and a draft token does not, because a draft that stops being
resumable after an hour is a feature nobody asked for — but that means a leaked
token is good until the draft is collected. The draft sweeper is what bounds it,
and that is a weaker bound than an expiry would be. Recorded rather than fixed,
because the right lifetime is a product question. The routes also still have no
rate limit of their own, which is a separate gap from this one and is listed in
the safety analysis.

## Alternatives considered

**Requiring a session.** Rejected: it would make drafts unavailable on exactly
the forms that need them, the anonymous public ones. The whole point of the
public plane is that somebody can fill in a form without an account.

**Keeping the client-chosen id and requiring a long random one.** Rejected as
security by documentation. A server cannot check that a client generated an id
well, so this is a rule enforced by hoping, and the first client to use a counter
reopens it for everybody on that deployment.

**Storing a per-draft secret in a table.** Would work, and was rejected for the
same reason [0059](0059-proof-of-work-not-a-captcha.md) rejected storing a nonce
per challenge: starting a draft is public and unauthenticated, so it would let an
attacker fill a table by starting drafts they never finish. An HMAC needs no row.

**A signed JWT via `jose`, which is already a dependency.** Rejected as more than
is needed. There are no claims to carry beyond the two identifiers, no audience,
and no expiry yet — a JWT would add a parser and a set of algorithm confusion
questions to something that is one HMAC over two fields.
