# 0169 — A response is stored once, under the id it was handed

- **Status:** accepted
- **Date:** 2026-10-10
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/server-core/src/submitting.test.ts` — an anonymous response
  without a token is refused and nothing is stored; every reading of a form hands out a new
  token and the response is stored under the id it names; sent twice, it is stored once with
  one audit row; a refused attempt — invalid answers, a stale hash — spends nothing; another
  form's token, a forged signature, one signed under another key and one that is not a token
  are refused; a token handed out before a republish submits against the new version; a
  signed-in submitter may leave it out, and one it sends is checked and spent; a draft's
  token names the draft, a resume hands back the same one, and a draft resumed a month later
  submits — once. `packages/server/src/server.integration.test.ts` against real PostgreSQL,
  *a response is stored once*: the form's reply carries a new token every time and
  `Cache-Control: no-store`; no token is `400 submission_token_required`, another form's is
  `400 submission_token_invalid`, a second send is `409 submission_token_spent` with one row
  and one audit row; two sends held at the insert until both are there store one and refuse
  the other — with a plain insert the second is a `500`, watched; a draft resumed and sent
  again is refused; a response with a file sent again is refused as sent rather than with
  `422` for an unknown file, watched failing without the lookup before the replay; and, with
  the challenge on, an attempt refused for its challenge keeps its token while a retry that
  solves a fresh challenge is still refused as sent. `apps/admin/src/fill-pane.test.tsx`,
  *sending the response*: the form's token in a header, the draft's once a draft has started,
  the one a resume hands back, and an already-sent refusal said while the answers stay on the
  page. `apps/docs/src/claims.test.ts` fails on a live document that still says the server
  has no submission token.

## Context

0.2.0's list of what it knowingly did not have opened with *"No submission token bound to the
form version. This is the gap that keeps the public plane off a public deployment."* The README,
the self-hosting guide, the documentation's landing page and the SOUP declaration said the
same. None of them said what the token would stop, and a token can be built to stop several
different things. So the threat came first: what could an anonymous submission do in 0.4.0
that a token would prevent?

What guarded the route then: a form is private until somebody opens it, and an origin
allowlist is matched exactly when one is set
([0044](0044-access-outside-the-document.md)); per-IP rate limits, counting the client a named
proxy reports ([0156](0156-a-proxy-is-trusted-by-its-address.md)); the body cap; the
proof-of-work challenge when `FORMANCY_CHALLENGE_SECRET` is set, one per attempt and spent in a
table ([0059](0059-proof-of-work-not-a-captcha.md)); the schema hash every submission declares;
and the replay, which recomputes and strips whatever arrived.

Three things the phrase could mean.

**A script that never loaded the form.** It needs the form's path and its schema hash, and
`GET /f/:path` hands both to anybody, deliberately without a limit. A token handed out with
the form proves the form was read, and a script reads the form: one request more per
submission, and nothing else. 0059 rejected exactly this token as a defence for exactly this
reason — *"it proves the form was fetched, not that anything was spent, and a script fetches
the form."* What prices a script is the challenge, per submission, and the rate limits. **No
token closes this, and this one does not try.** A deployment with public forms and no
challenge secret has the rate limits and nothing else between a script and its database,
before this change and after it.

**A submission against a version other than the one the respondent saw.** Already closed.
Every submission declares the hash it rendered, and anything other than the current version's
is refused `409 FORM_VERSION_CHANGED` with the current schema attached; the replay runs
against the current version whatever is declared, and the submission is bound to that version
by foreign key. A sender who lies about the hash gains nothing, because the server checks the
answers against what it has. A token carrying the version as well would be a second answer to
one question, and the two would disagree at a draft resumed after a compatible republish,
which the server rebinds to the new version
([0027](0027-lazy-draft-migration.md)) while its token named the old one.

**The same response stored twice.** Open, three ways:

- Without a challenge secret — a supported state — an exact replay of a submission is stored
  again, as often as the rate limit allows.
- With one, a retry after a lost answer — the connection dropped, a proxy timed out, a phone
  changed networks before the `201` arrived — asks for a new challenge, solves it, and is
  stored a second time. The challenge proves work per attempt; it cannot say that two attempts
  are one response.
- A signed-in submitter is never asked to solve a challenge, so every copy is stored.

Each copy is a submission with its own id, its own audit row and its own webhook. A delivery's
event id lets a receiver drop a *delivery* it got twice; nothing let anybody tell one response
sent twice from two respondents who gave the same answers. On the forms this product is built
for, that is two intake records, two orders or two appointments.

Not on the list: another site making its visitors' browsers submit. A submission carries a
custom header, so a browser asks the server first, and this server sends no CORS headers, so
the browser never sends it; a deployment that adds CORS at its proxy has the origin allowlist,
which refuses a missing `Origin` too.

So the gap 0.2.0 named was narrower than its sentence. Of three things it could mean, no token
can close the first, the second was closed already, and the third — one response stored more
than once — is what this decision closes.

## Decision

**A form is handed out with the id its response will be stored under, signed for that form.
The response is stored under that id, and the storage refuses it twice.**

- **What the token binds:** the form and the id, as `<id>.<HMAC-SHA256(key, "submission:" +
  form + ":" + id)>`. Not the version, which the hash binds. Not a time window, for the reason
  under *Alternatives*. The id becomes the submission's primary key, so single use **is** the
  primary key: nothing new is stored, and nothing needs sweeping.
- **Where it is handed out:** with the form — `GET /f/:path` returns `submissionToken`, a new
  one every reading, with `Cache-Control: no-store` — and with a draft: starting one and
  resuming one return a token naming the draft's own id, the same on every resume. A draft is
  one response, however late and however often it is resumed.
- **What signs it:** the deployment's own key, `FORMANCY_AUTH_SECRET`, as a draft's key is and
  for [0062](0062-a-draft-carries-its-own-key.md)'s reason — an optional secret is no protection
  wherever nobody set it. Handing one out writes nothing, so asking for a thousand fills no
  table. The message begins with a word no form id is, so a draft's key is never also a
  response's signature. Both keys are in `server-core/signing.ts`, side by side.
- **Where it is checked:** in `createSubmission`, after the access check and before the
  version and the replay. An anonymous response without one is `400
  submission_token_required`. One this server did not sign for this form — forged, another
  form's, or signed under a key the deployment no longer has — is `400
  submission_token_invalid`. One whose response is stored is `409 submission_token_spent`,
  with the stored id. A signed-in submitter may leave it out and is stored under a fresh id, as
  before; one it does send is checked and spent like anybody else's.
- **What spends it: the insert, and only the insert.** `insertSubmission` writes the row first
  with `ON CONFLICT DO NOTHING`, and when that conflicts writes nothing else — no delivery, no
  claim on a file, no audit row — and says so. A lookup before the replay, `hasSubmission`,
  answers a second send as sent rather than as *"the files you name are unknown"*, which is
  what the claim says of files the first send already took; two sends at once both find
  nothing there, and the insert decides between them. A refused attempt — answers that do not
  validate, a stale hash, a list that could not vouch for an answer, a challenge not solved —
  spends nothing.
- **With the challenge:** independent. The challenge is per attempt and spent before the
  replay; the token is per response and spent when the response is stored. A retry pays for a
  new challenge and is refused as sent.
- **What a respondent is told:** each refusal carries a sentence a host can show as it stands,
  and none clears anything. Already sent: *"This response has already been sent, and is
  stored. It was not stored again."* — about the response, never about *these answers*, since
  a second send may carry different ones and it is the first that is kept. Missing or not
  recognised: read the form again for a new token and send the answers with it, which the page
  still holds.
- **What changes for a client.** The renderers send nothing — the host holds the transport —
  so nothing in them changes. A host's own submit path reads `submissionToken` with the form,
  takes the draft's instead once it starts or resumes one, and sends it in
  `X-Formancy-Submission-Token`. The admin's *fill in* tab does exactly that, and is the one
  place in the repository where a browser submits to the server: formancy.ai submits nothing
  anywhere ([0154](0154-the-website-makes-no-request-to-any-other-site.md)), and the playground
  has no server.

## Consequences

**What it buys.** A response is stored once. The retry a network forces, the double press
that slipped past a disabled button, and a replay where the challenge is off are each
answered `409` with the id that was stored, rather than becoming a second row, a second webhook
and a second person in the operator's export.

**What it costs.** Every host that submits anonymously without the admin breaks: it gets `400
submission_token_required` until it sends the token, and there is no window in which the old
request works, because a window is a time in which a response is stored twice. A `409` now
means two things — the form changed, or the response was sent — so a client tells them apart by
`error`, not by status. The form's reply is per reading: a cache that keeps it despite
`no-store` hands one token to everybody behind it, and every response after the first is
refused as sent — loudly, and with no way out, since reading the form again reads the cache.
Changing the signing key refuses once every response being filled in when it changed, and an
unset `FORMANCY_AUTH_SECRET` is a new key at every start, so a restart does that to everybody
filling in a form, as it already lost their drafts. A page holds two tokens once a draft
starts, and a host that keeps sending the form's has the duplicate back through the one path a
reload takes. `Storage` gains `hasSubmission`, and `insertSubmission` now answers whether it
stored, atomically — breaking for anybody implementing the port. And a response's id is known to
the page before it is sent; nothing public is addressed by a submission's id.

**What it does not do.** It does not slow a script, which reads the form for a token as any
browser does; that is the challenge's job and the rate limits'. It does not bind the version.
It does not expire. A respondent who reloads a page that kept no draft and fills the form in
again sends a second response, because a new reading is a new response, and nothing here can
tell that person from a second one. A signed-in client that sends no token is stored as often
as it sends.

## Alternatives considered

**Bind the version, or the schema hash, into the token.** A second answer to the question the
hash already answers, and one that would refuse a draft rebound to a newer version on resume
— or need a third mechanism to re-issue its token.

**An expiry.** Anybody can read the form for a fresh token, so a window bounds nothing a script
does; what it would refuse is the slow respondent, who is the one a draft exists for. Single
use already bounds a leaked token to one response.

**A minimum fill time**, a *not before* in the token, as 0044 listed among the layers the
public plane lacked. It costs a script that reads a thousand forms and waits a few seconds of
latency and no throughput, and it refuses the person whose browser filled the form in for them.

**A table of spent tokens, as the challenge has.** A second record of what the submissions
table already says, swept on a schedule — and spent outside the submission's transaction it
would be spent by a response that then rolled back, which is the lost answer this must not
cause.

**Hand it out only on a `POST`**, by starting a draft for every response. A `POST`'s reply is
not cached, which would remove the cache residual above; it would cost every host that keeps no
draft a round trip, and name a draft a response that is never saved.

**Require it of signed-in submitters too.** An integration posting records with an API key was
handed no form; it would have to read one per record to submit at all, for a duplicate only its
own retry can create. The challenge exempts the same submitters for a related reason.

**Answer a second send with the first's `201` when its answers match.** Kinder to a retry. But
deciding that two sets of answers match — after a replay that recomputes, from a column that
reorders keys — is a comparison to keep right forever, and a `201` for answers that were not the
ones stored would tell the respondent something false that they cannot check. The `409` says
what happened.
